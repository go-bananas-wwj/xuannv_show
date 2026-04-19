import { motion } from 'framer-motion'
import { Mail, User, ArrowUpRight } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

export default function ContactSection() {
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-2xl mx-auto"
        >
          <GlassPanel className="p-8 md:p-12">
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
      </div>
    </section>
  )
}
