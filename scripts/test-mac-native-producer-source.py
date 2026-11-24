import base64
import copy
import hashlib
import json
from pathlib import Path
import runpy
import unittest

M=runpy.run_path(str(Path(__file__).with_name("mac-native-producer-source.py")))
T=runpy.run_path(str(Path(__file__).with_name("mac-native-suite-transfer-fetch.py")))
R=runpy.run_path(str(Path(__file__).with_name("mac-native-361-remaining.py")))


def fixture():
    workflow=b"synthetic reviewed producer workflow; unit data, not actual P5 output"
    value={"separateProducerApproved":True,"sourceCommit":"a"*40,"sourceTree":"b"*40,"declaredVersion":"2026.48.1",
           "producerCommit":"c"*40,"producerTree":"d"*40,"producerWorkflowSha256":M["sha"](workflow),
           "checkoutWorkflowSha256":"e"*64,"producerRef":"refs/heads/codex/p5-macos-only-producer-20261123",
           "producerWorkflowPath":M["WORKFLOW"],"sourceWitnessRequired":True,"sourceWitnessMember":M["MEMBER"],
           "archiveBytes":1234,"artifactRun":2,"artifactAttempt":1,"artifactId":3,"artifactName":"uitgave-macOS","archiveSha256":"f"*64,
           "successfulPlatformJob":4,"successfulPlatformJobName":"Bouwen – macOS"}
    parsed=M["expected_witness"](value)
    raw=json.dumps(parsed,indent=2).encode()+b"\n"
    value["sourceWitnessSha256"]=M["sha"](raw)
    witness={"member":M["MEMBER"],"sha256":M["sha"](raw),"bytes":len(raw),"rawBase64":base64.b64encode(raw).decode(),"value":parsed}
    run={"id":2,"head_sha":value["producerCommit"],"head_branch":value["producerRef"].removeprefix("refs/heads/"),
         "path":M["WORKFLOW"],"event":"workflow_dispatch","run_attempt":1,"conclusion":None}
    artifact={"id":3,"name":"uitgave-macOS","expired":False,"digest":"sha256:"+value["archiveSha256"],
              "size_in_bytes":1234,"workflow_run":{"id":2,"head_sha":value["producerCommit"]}}
    job={"id":4,"run_id":2,"head_sha":value["producerCommit"],"run_attempt":1,"name":"Bouwen – macOS",
         "status":"completed","conclusion":"success","labels":["macos-latest"]}
    commit={"sha":value["producerCommit"],"tree":{"sha":value["producerTree"]}}
    contents={"path":M["WORKFLOW"],"encoding":"base64","content":base64.b64encode(workflow).decode(),"size":len(workflow),
              "sha":hashlib.sha1(b"blob "+str(len(workflow)).encode()+b"\0"+workflow).hexdigest()}
    return value,witness,raw,run,artifact,job,commit,contents


class SeparateProducer(unittest.TestCase):
    def test_distinct_producer_api_and_original_witness_bytes(self):
        v,w,raw,*api=fixture()
        proof=M["verify_api"](v,*api);self.assertTrue(proof["sourcesDistinct"])
        self.assertEqual(M["verify_witness"](v,w),raw)

    def test_wrong_producer_head_tree_or_stale_run_never_becomes_app_source(self):
        for change in ["run-head","artifact-head","job-head","producer-tree","stale-run","stale-attempt"]:
            v,w,raw,r,a,j,c,f=fixture()
            if change=="run-head":r["head_sha"]=v["sourceCommit"]
            elif change=="artifact-head":a["workflow_run"]["head_sha"]=v["sourceCommit"]
            elif change=="job-head":j["head_sha"]=v["sourceCommit"]
            elif change=="producer-tree":c["tree"]["sha"]=v["sourceTree"]
            elif change=="stale-run":j["run_id"]=1
            else:r["run_attempt"]=2
            with self.subTest(change=change),self.assertRaises(RuntimeError):M["verify_api"](v,r,a,j,c,f)

    def test_parent_bytes_required_and_exact_in_api(self):
        v,w,raw,r,a,j,c,f=fixture()
        a["size_in_bytes"]+=1
        with self.assertRaises(RuntimeError):M["verify_api"](v,r,a,j,c,f)
        v["archiveBytes"]=None
        with self.assertRaises(RuntimeError):M["validate_pins"](v)

    def test_actual_witness_wrong_app_tree_producer_run_or_scope_rejected(self):
        for key,bad in [("appHead","0"*40),("appTree","0"*40),("producerHead","0"*40),("runId","1"),
                        ("attempt","2"),("producerRef","refs/heads/main"),("publiceren","true"),("nativeAccepted",0),
                        ("checkoutWorkflowSha256","0"*64)]:
            v,w,*_=fixture();w["value"][key]=bad
            # A self-consistent raw/hash pair still cannot change the frozen facts.
            raw=json.dumps(w["value"]).encode();w.update(rawBase64=base64.b64encode(raw).decode(),bytes=len(raw),sha256=M["sha"](raw));v["sourceWitnessSha256"]=M["sha"](raw)
            with self.subTest(key=key),self.assertRaises(RuntimeError):M["verify_witness"](v,w)

    def test_missing_or_tampered_actual_witness_cannot_receive_root_hash(self):
        for change in ["missing","base64","bytes","sha","value","root-not-frozen"]:
            v,w,*_=fixture()
            if change=="missing":w=None
            elif change=="base64":w["rawBase64"]="not base64"
            elif change=="bytes":w["bytes"]+=1
            elif change=="sha":w["sha256"]="0"*64
            elif change=="value":w["value"]["job"]="other"
            else:v["sourceWitnessSha256"]=None
            with self.subTest(change=change),self.assertRaises(RuntimeError):M["verify_witness"](v,w)

    def test_producer_workflow_and_app_checkout_hash_cannot_be_swapped(self):
        v,w,raw,*api=fixture();v["producerWorkflowSha256"],v["checkoutWorkflowSha256"]=v["checkoutWorkflowSha256"],v["producerWorkflowSha256"]
        with self.assertRaises(RuntimeError):M["verify_api"](v,*api)

    def test_witness_required_in_both_child_layers_and_preparer_chain_stays_separate(self):
        v,w,raw,*_=fixture();data=b"synthetic Suite DMG unit data"
        v.update(packageMember="dist-installers/office/dmg/Open Office Studio_2026.48.1_aarch64.dmg",
                 transferRun=12,transferCommit="1"*40,transferAttempt=1,transferArtifactId=11,
                 transferArtifactName="standalone-support-suite",transferArchiveSha256="2"*64,transferArchiveBytes=100,
                 transferProducerJob=14,transferProducerJobName="prepare")
        provenance={"schemaVersion":1,"app":"office","source":T["source_pin"](v),"parentArtifact":T["parent_pin"](v),
                    "member":v["packageMember"],"memberSHA256DerivedFromVerifiedParent":True,
                    "purpose":"separate-suite-owner","nativeExecutionApproved":False,"nativeAccepted":False,
                    "package":{"filename":Path(v["packageMember"]).name,"bytes":len(data),"sha256":M["sha"](data)},"sourceWitness":copy.deepcopy(w)}
        child={"id":11,"name":"standalone-support-suite","expired":False,"digest":"sha256:"+v["transferArchiveSha256"],
               "size_in_bytes":100,"created_at":"2026-11-23T12:30:00Z","workflow_run":{"id":12,"head_sha":v["transferCommit"]}}
        envelope={"schemaVersion":1,"scope":T["SCOPE"],"source":T["source_pin"](v),"officialParentArtifact":T["parent_pin"](v),
                  "suitePackage":dict(provenance["package"],member=v["packageMember"]),"expectedInstalledIdentity":T["installed_pin"](v),
                  "validationOwner":"mac_native_release_blocker","nativeExecutionPerformed":False,"nativeAccepted":False,
                  "suiteDeliveryToStandaloneHostsAuthorized":False,"sourceWitness":copy.deepcopy(w),
                  "suiteTransferArtifact":{"id":11,"name":"standalone-support-suite","sha256":v["transferArchiveSha256"],
                                           "qaRun":12,"qaCommit":v["transferCommit"],"officialApiDigestVerified":True,
                                           "wholeChildArchiveHashVerifiedByPreparer":False,"officialApiMetadata":copy.deepcopy(child)}}
        T["verify_descriptor"](v,provenance,data);self.assertEqual(T["verify_envelope"](v,envelope,child),raw)
        for layer in ["provenance","envelope"]:
            bad=copy.deepcopy(provenance if layer=="provenance" else envelope);bad.pop("sourceWitness")
            with self.subTest(layer=layer),self.assertRaises(RuntimeError):
                if layer=="provenance":T["verify_descriptor"](v,bad,data)
                else:T["verify_envelope"](v,bad,child)
        preparer_run={"id":12,"head_sha":v["transferCommit"],"run_attempt":1}
        preparer_job={"id":14,"run_id":12,"head_sha":v["transferCommit"],"run_attempt":1,"name":"prepare","status":"completed","conclusion":"success"}
        T["verify_transfer_origin"](v,preparer_run,child,preparer_job)
        with self.assertRaises(RuntimeError):T["verify_transfer_origin"](v,{"id":2,"head_sha":v["producerCommit"],"run_attempt":1},child,preparer_job)

    def test_prior_native_core_cannot_hide_another_producer_or_witness_behind_same_app_bytes(self):
        v,*_=fixture();v.update(packageSha256="1"*64,executableSha256="2"*64)
        old={"status":"native-core-passed","nativePass":True,"nativeControlPreflight":{"status":"passed"},
             "nativeOriginalTable":{"status":"core-passed"},"identity":copy.deepcopy(v)}
        R["validate_previous_core"](v,old)
        for key in ["producerCommit","sourceWitnessSha256","artifactRun"]:
            wrong=copy.deepcopy(old);wrong["identity"][key]="stale"
            with self.subTest(key=key),self.assertRaises(RuntimeError):R["validate_previous_core"](v,wrong)


if __name__=="__main__":unittest.main()
