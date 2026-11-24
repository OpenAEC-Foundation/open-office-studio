"""Hard deadline around the own #375 controller, including Python/file I/O."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

CONTROLLER_SECONDS = 260 * 60
RESERVE_SECONDS = 10 * 60


def supervise(argv, out, start_epoch, controller_seconds=CONTROLLER_SECONDS, cleanup_seconds=5):
    assert 0 < controller_seconds <= CONTROLLER_SECONDS and 0 < cleanup_seconds <= 5
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    deadline = start_epoch + controller_seconds
    result = {'allocatedStartEpoch': start_epoch, 'controllerDeadlineEpoch': deadline,
              'totalDeadlineEpoch': deadline + RESERVE_SECONDS, 'timedOut': False,
              'controllerStarted': False, 'reservedSeconds': RESERVE_SECONDS}
    process = None

    def stop_owned_group():
        if process is None:
            return
        if os.name == 'posix':
            # This id came directly from our start_new_session Popen, never a
            # process search or user/shared PID. Its children inherit the group.
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    break
                if sig == signal.SIGTERM:
                    try:
                        process.wait(timeout=cleanup_seconds)
                    except subprocess.TimeoutExpired:
                        pass
        elif process.poll() is None:
            # Windows is used only by the offline pure-Python controls.
            process.kill()
        process.wait(timeout=cleanup_seconds)

    try:
        remaining = deadline - time.time()
        if remaining <= 0:
            result['timedOut'] = True
            result['exitCode'] = 124
            return 124
        options = {'start_new_session': True} if os.name == 'posix' else {
            'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP}
        environment = dict(os.environ, OOS_375_SUPERVISED='1')
        process = subprocess.Popen(argv, env=environment, stdin=subprocess.DEVNULL, **options)
        result.update(controllerStarted=True, controllerPID=process.pid,
                      ownedProcessGroup=process.pid if os.name == 'posix' else None)
        try:
            code = process.wait(timeout=max(0, deadline - time.time()))
        except subprocess.TimeoutExpired:
            result['timedOut'] = True
            result['terminationRequestedEpoch'] = time.time()
            code = 124
        finally:
            # Also clear remaining own helpers after a controller failure.
            if result['timedOut'] or process.returncode != 0:
                stop_owned_group()
        result['processingStoppedEpoch'] = time.time()
        result['exitCode'] = code
        return code
    except BaseException as error:
        result['supervisorError'] = type(error).__name__
        stop_owned_group()
        raise
    finally:
        result['receiptEpoch'] = time.time()
        result['remainingUploadCleanupSeconds'] = max(0, deadline + RESERVE_SECONDS - time.time())
        # Small independent emergency receipt; no source/profile hashing or
        # copying after the controller deadline. A killed worker's last atomic
        # build-report and raw evidence remain unmodified.
        temporary = out / 'controller-envelope.json.tmp'
        temporary.write_text(json.dumps(result, indent=2) + '\n')
        temporary.replace(out / 'controller-envelope.json')


if __name__ == '__main__':
    assert sys.platform.startswith('linux') and os.environ.get('GITHUB_ACTIONS') == 'true'
    raw = os.environ.get('OOS_375_WITNESS_START_EPOCH') or os.environ['OOS_375_JOB_START_EPOCH']
    assert raw.isdecimal() and len(raw) == 10
    own = Path(__file__).resolve().parent
    sys.exit(supervise([sys.executable, str(own / 'source_build.py')],
                       '.local/presentation-375-source-build', int(raw)))
