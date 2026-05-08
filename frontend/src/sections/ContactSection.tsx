import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, User, ArrowUpRight, Play, Satellite, X } from 'lucide-react'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}
import GlassPanel from '@/components/GlassPanel'

export default function ContactSection() {
  const [showVideo, setShowVideo] = useState(false)

  return (
    <section id="section-contact" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-sky-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              联系我们
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            如有关于玄女底座的合作意向、技术咨询或数据需求，欢迎联系
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Contact Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <GlassPanel className="p-8 md:p-10 h-full">
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center mx-auto mb-4">
                  <User className="w-10 h-10 text-sky-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">伍炜杰</h3>
                <p className="text-slate-500">玄女底座项目负责人</p>
              </div>

              <a
                href="mailto:wuweijie25@mails.ucas.ac.cn"
                className="flex items-center justify-center gap-3 p-4 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 hover:bg-sky-100 transition-colors group"
              >
                <Mail className="w-5 h-5" />
                <span className="font-mono text-sm md:text-base">wuweijie25@mails.ucas.ac.cn</span>
                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>

              <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <p className="text-sm text-slate-400">
                  中国科学院大学
                </p>
              </div>
            </GlassPanel>
          </motion.div>

          {/* EarthExplorer Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <GlassPanel className="p-8 md:p-10 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Satellite className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">EarthEmbeddingExplorer</h3>
                  <p className="text-xs text-slate-400">跨模态全球卫星影像检索</p>
                </div>
              </div>

              <p className="text-sm text-slate-500 leading-relaxed mb-6 flex-1">
                一个交互式 Web 应用，支持文本、图像、地理位置三种查询模式，
                实现全球卫星影像的跨模态检索与对比分析。
                基于 DINOv2、FarSLIP、SatCLIP、SigLIP 四种互补嵌入模型，
                为遥感基础模型的能力评估提供直观工具。
              </p>

              <div className="space-y-3">
                <a
                  href="https://github.com/OpenGeoScope/EarthEmbeddingExplorer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors text-sm font-medium"
                >
                  <GitHubIcon className="w-4 h-4" />
                  GitHub 仓库
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <button
                  onClick={() => setShowVideo(true)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-colors text-sm font-medium"
                >
                  <Play className="w-4 h-4" />
                  观看 Demo 视频
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400 text-center">
                  中科院空天信息创新研究院 · EGU26 / ICLR26 ML4RS
                </p>
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      </div>

      {/* Video Modal */}
      <AnimatePresence>
        {showVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowVideo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-[90vw] max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src="/videos/EarthEmbeddingExplorer-demo.mp4"
                controls
                autoPlay
                className="rounded-xl shadow-2xl max-w-full max-h-[85vh]"
                style={{ width: 'auto', height: 'auto' }}
              />
              <button
                onClick={() => setShowVideo(false)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center shadow-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
