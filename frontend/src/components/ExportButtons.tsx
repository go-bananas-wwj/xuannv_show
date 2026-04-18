import { Image as ImageIcon, FileText } from 'lucide-react'

interface ExportButtonsProps {
  onExportPng?: () => void
  onExportPdf?: () => void
}

export default function ExportButtons({ onExportPng, onExportPdf }: ExportButtonsProps) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onExportPng || handlePrint}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 transition-all"
      >
        <ImageIcon className="w-4 h-4" />
        导出 PNG
      </button>
      <button
        onClick={onExportPdf || handlePrint}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 transition-all"
      >
        <FileText className="w-4 h-4" />
        导出 PDF
      </button>
    </div>
  )
}
