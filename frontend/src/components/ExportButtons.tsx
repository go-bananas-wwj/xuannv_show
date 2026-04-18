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
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 transition-all"
      >
        <ImageIcon className="w-4 h-4" />
        导出 PNG
      </button>
      <button
        onClick={onExportPdf || handlePrint}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 transition-all"
      >
        <FileText className="w-4 h-4" />
        导出 PDF
      </button>
    </div>
  )
}
