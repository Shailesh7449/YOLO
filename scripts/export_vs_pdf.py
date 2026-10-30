import os
import subprocess

docx_path = os.path.abspath(r"d:\spidy\YOLO\VisionSense_BCSE497J_Project_I_Report.docx")
pdf_path = os.path.abspath(r"d:\spidy\YOLO\VisionSense_BCSE497J_Project_I_Report.pdf")

ps_content = f"""
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {{
    Write-Host "Opening document: {docx_path}"
    $doc = $word.Documents.Open("{docx_path}")
    $page_count = $doc.ComputeStatistics(2)
    Write-Host "Document opened successfully! Pages count: $page_count"
    Write-Host "Exporting to PDF: {pdf_path}"
    $doc.ExportAsFixedFormat("{pdf_path}", 17) # 17 = wdExportFormatPDF
    $doc.Close([ref]$false)
    Write-Host "EXPORT_SUCCESS"
}} catch {{
    Write-Host "ERROR:" $_.Exception.Message
}} finally {{
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}}
"""

ps_path = os.path.abspath("export_vs_pdf.ps1")
with open(ps_path, "w", encoding="utf-8") as f:
    f.write(ps_content)

res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_path], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
print("PDF created:", os.path.exists(pdf_path))
if os.path.exists(pdf_path):
    print("PDF File Size:", os.path.getsize(pdf_path), "bytes")
if os.path.exists(ps_path):
    os.remove(ps_path)
