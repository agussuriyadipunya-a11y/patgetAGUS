' ==============================================================
' Script Jalankan Kiosk di Background (Tanpa Jendela CMD)
' Server tetap aktif 24/7 meskipun semua jendela browser ditutup
' ==============================================================

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Cari node executable
nodeExe = "node"
If fso.FileExists(scriptDir & "\.tools\node\node.exe") Then
    nodeExe = """" & scriptDir & "\.tools\node\node.exe" & """"
End If

serverJs = """" & scriptDir & "\server\index.js" & """"
cmd = nodeExe & " " & serverJs

' Jalankan tersembunyi (0 = hidden, False = run async in background)
shell.CurrentDirectory = scriptDir
shell.Run cmd, 0, False

WScript.Sleep 1500
shell.Run "http://localhost:3000"
