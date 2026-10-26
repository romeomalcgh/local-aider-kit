#define MyAppName "Local Aider Kit"
#define MyAppVersion "0.2.0"
[Setup]
AppId={{A2B47B9D-7C5E-4C66-97AA-123456789ABC}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\LocalAiderKit
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=LocalAiderKit-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "setup.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "browser-ui\*"; DestDir: "{app}\browser-ui"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: "node_modules\*,dist\*,data\*,.gitignore,cloud\worker\.wrangler\*"

[Icons]
Name: "{userdesktop}\Local Aider Kit"; Filename: "{app}\launch.bat"; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\setup.ps1"""; Description: "Install local Aider, Ollama, model and browser UI"; Flags: postinstall waituntilterminated
