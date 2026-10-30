import subprocess
import os

ps_content = """
$word = New-Object -ComObject Word.Application
$word.Visible = $false
Write-Host "Word COM Version:" $word.Version
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Host "SUCCESS: Word COM is working!"
"""

ps_path = os.path.abspath("test_word.ps1")
with open(ps_path, "w", encoding="utf-8") as f:
    f.write(ps_content)

res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_path], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
if os.path.exists(ps_path):
    os.remove(ps_path)
