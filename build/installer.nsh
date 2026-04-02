; ODN Tunnel Service — NSIS installer hooks
; Installs the privileged tunnel service during app installation
; and removes it during uninstallation.
;
; The service runs server.js via the Electron binary with ELECTRON_RUN_AS_NODE=1,
; which makes Electron act as a plain Node.js runtime.

!macro customInstall
  ; Install and start the tunnel service
  ; The NSIS installer already runs elevated, so no extra UAC prompt needed
  DetailPrint "Installing ODN Tunnel Service..."

  ; Stop existing service if present (ignore errors)
  nsExec::ExecToLog 'sc stop OdnTunnelService'

  ; Delete existing service if present (ignore errors)
  nsExec::ExecToLog 'sc delete OdnTunnelService'

  ; Create the service wrapper script that sets ELECTRON_RUN_AS_NODE=1
  FileOpen $0 "$INSTDIR\resources\service-wrapper.cmd" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'set ELECTRON_RUN_AS_NODE=1$\r$\n'
  FileWrite $0 '"$INSTDIR\odn-client.exe" "$INSTDIR\resources\service\server.js"$\r$\n'
  FileClose $0

  ; Create the service pointing to the wrapper script
  nsExec::ExecToLog 'sc create OdnTunnelService binPath= "$INSTDIR\resources\service-wrapper.cmd" start= auto DisplayName= "ODN Tunnel Service"'

  ; Set service description
  nsExec::ExecToLog 'sc description OdnTunnelService "Manages WireGuard tunnel connections for ODN Connect"'

  ; Start the service
  nsExec::ExecToLog 'sc start OdnTunnelService'

  DetailPrint "ODN Tunnel Service installed."
!macroend

!macro customUnInstall
  ; Stop and remove the tunnel service
  DetailPrint "Removing ODN Tunnel Service..."

  nsExec::ExecToLog 'sc stop OdnTunnelService'
  nsExec::ExecToLog 'sc delete OdnTunnelService'

  ; Clean up wrapper script
  Delete "$INSTDIR\resources\service-wrapper.cmd"

  DetailPrint "ODN Tunnel Service removed."
!macroend
