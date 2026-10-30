import subprocess
import os

docx_path = os.path.abspath("test_styled.docx")
pdf_path = os.path.abspath("test_styled.pdf")

ps_content = f"""
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {{
    $doc = $word.Documents.Open("{docx_path}")
    $doc.ExportAsFixedFormat("{pdf_path}", 17) # 17 = wdExportFormatPDF
    $doc.Close([ref]$false)
    Write-Host "PDF export successful!"
}} catch {{
    Write-Host "Error: " $_.Exception.Message
}} finally {{
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}}
"""

ps_path = os.path.abspath("export_test.ps1")
with open(ps_path, "w", encoding="utf-8") as f:
    f.write(ps_content)

res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_path], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
print("PDF exists:", os.path.exists(pdf_path))
if os.path.exists(ps_path):
    os.remove(ps_path)
