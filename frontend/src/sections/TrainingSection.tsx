import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PenTool, ArrowRight } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

export default function TrainingSection() {
  return (
    <section id="section-training" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <PenTool className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              自定义训练
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            基于交互式 SAM3 分割与手工标注，快速构建专属遥感分类头模型
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-3xl mx-auto"
        >
          <GlassPanel className="p-8 md:p-12">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto">
                <PenTool className="w-8 h-8 text-amber-500" />
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800">
                  交互式遥感样本标注与模型训练
                </h3>
                <p className="text-slate-600 leading-relaxed max-w-xl mx-auto">
                  本平台支持在卫星影像 Patch 上进行点选、多边形、折线等多种方式的交互式标注。
                  借助 SAM3 大模型，仅需少量提示点即可自动生成高质量分割 mask，
                  大幅降低遥感样本标注成本。标注完成后可一键训练专属分类头，
                  并直接在平台上进行批量推理与应用测试。
                </p>
              </div>

              <Link
                to="/annotate"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium shadow-sm hover:shadow-md"
              >
                <PenTool className="w-4 h-4" />
                进入自定义训练
                <ArrowRight className="w-4 h-4" />
              </Link>

              <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-2">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  SAM3 智能分割
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  多模式标注
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  一键训练
                </span>
              </div>
            </div>
          </GlassPanel>
        </motion.div>
      </div>
    </section>
  )
}
