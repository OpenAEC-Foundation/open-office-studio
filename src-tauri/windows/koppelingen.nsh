; Registreert Open Office Studio onder Standaard-apps en in "Openen met" van
; Windows, zodat alle gekoppelde kantoorformaten op één plek aan deze app kunnen
; worden toegewezen. De ProgID's zelf schrijft de Tauri-installer op basis van
; bundle.fileAssociations in tauri.windows.conf.json; tests/test_koppelingen.py
; bewaakt dat beide lijsten gelijk blijven.
!define OOS_CAPABILITIES "Software\OpenAEC\Open Office Studio\Capabilities"

!macro OOS_ALLE MACRO
  !insertmacro ${MACRO} ifcx OpenAEC.OfficeStudio.IFCX
  !insertmacro ${MACRO} docx OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} docm OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} dotx OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} dotm OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} doc OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} dot OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} odt OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} ott OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} rtf OpenAEC.OfficeStudio.Tekst
  !insertmacro ${MACRO} xlsx OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} xlsm OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} xltx OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} xltm OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} xlsb OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} xls OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} xlt OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} ods OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} ots OpenAEC.OfficeStudio.Rekenblad
  !insertmacro ${MACRO} pptx OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} pptm OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} potx OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} potm OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} ppsx OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} pps OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} ppt OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} pot OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} odp OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} otp OpenAEC.OfficeStudio.Presentatie
  !insertmacro ${MACRO} mdb OpenAEC.OfficeStudio.Database
  !insertmacro ${MACRO} accdb OpenAEC.OfficeStudio.Database
!macroend

; Bij een herinstallatie wijst de extensie al naar deze app. Zonder herstel zou de
; Tauri-installer die waarde als "vorige koppeling" bewaren en bij verwijderen
; terugzetten, zodat de extensie naar een verwijderde ProgID blijft wijzen.
!macro OOS_HERSTEL EXT KLASSE
  Push $R0
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  StrCmp $R0 "${KLASSE}" 0 +5
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "${KLASSE}_backup"
  StrCmp $R0 "${KLASSE}" 0 +2
  StrCpy $R0 ""
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R0"
  Pop $R0
!macroend

!macro OOS_KOPPEL EXT KLASSE
  WriteRegStr SHCTX "${OOS_CAPABILITIES}\FileAssociations" ".${EXT}" "${KLASSE}"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${KLASSE}" ""
!macroend

!macro OOS_ONTKOPPEL EXT KLASSE
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${KLASSE}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${KLASSE}_backup"
  Push $R0
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  StrCmp $R0 "${KLASSE}" 0 +2
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
  Pop $R0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro OOS_ALLE OOS_HERSTEL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${OOS_CAPABILITIES}" "ApplicationName" "Open Office Studio"
  WriteRegStr SHCTX "${OOS_CAPABILITIES}" "ApplicationDescription" "Lokale OpenAEC-kantooromgeving"
  WriteRegStr SHCTX "${OOS_CAPABILITIES}" "ApplicationIcon" "$INSTDIR\open-office-studio.exe,0"
  !insertmacro OOS_ALLE OOS_KOPPEL
  WriteRegStr SHCTX "Software\RegisteredApplications" "Open Office Studio" "${OOS_CAPABILITIES}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro OOS_ALLE OOS_ONTKOPPEL
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Open Office Studio"
  DeleteRegKey SHCTX "Software\OpenAEC\Open Office Studio"
  DeleteRegKey /ifempty SHCTX "Software\OpenAEC"
!macroend
