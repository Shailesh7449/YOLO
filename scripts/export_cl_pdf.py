import os
import subprocess

docx_path = os.path.abspath(r"d:\spidy\YOLO\BCSE497J_Change_Log_and_Pending_Items.docx")
pdf_path = os.path.abspath(r"d:\spidy\YOLO\BCSE497J_Change_Log_and_Pending_Items.pdf")

ps_content = f"""
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {{
    $doc = $word.Documents.Open("{docx_path}")
    $doc.ExportAsFixedFormat("{pdf_path}", 17)
    $doc.Close([ref]$false)
    Write-Host "SUCCESS"
}} catch {{
    Write-Host "ERROR:" $_.Exception.Message
}} finally {{
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}}
"""

ps_file = os.path.abspath("exp_cl.ps1")
with open(ps_file, "w", encoding="utf-8") as f:
    f.write(ps_content)

res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_file], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
print("PDF exists:", os.path.exists(pdf_path))
if os.path.exists(ps_file):
    os.remove(ps_file)
