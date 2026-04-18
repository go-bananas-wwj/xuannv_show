import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface StatisticsChartProps {
  statistics: {
    change_areas?: number
    total_area_ha?: number
    confidence?: number
    categories?: Record<string, number>
  }
}

const COLORS = ['#f59e0b', '#0ea5e9', '#8b5cf6', '#10b981', '#ef4444']

export default function StatisticsChart({ statistics }: StatisticsChartProps) {
  const categories = statistics.categories || {}
  const pieData = Object.entries(categories).map(([name, value]) => ({
    name,
    value,
  }))

  const summaryData = [
    { name: '变化区域', value: statistics.change_areas || 0 },
    { name: '总面积(ha)', value: statistics.total_area_ha || 0 },
  ]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: '变化区域',
            value: statistics.change_areas || 0,
            unit: '处',
          },
          {
            label: '总面积',
            value: statistics.total_area_ha || 0,
            unit: '公顷',
          },
          {
            label: '置信度',
            value: Math.round((statistics.confidence || 0) * 100),
            unit: '%',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="text-center p-4 rounded-lg bg-slate-50"
          >
            <div className="text-2xl font-bold text-sky-500">
              {stat.value}
              <span className="text-sm text-slate-400 ml-1">{stat.unit}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {pieData.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-48">
            <p className="text-xs text-slate-400 mb-2">类别分布</p>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#1e293b',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="h-48">
            <p className="text-xs text-slate-400 mb-2">变化统计</p>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summaryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#1e293b',
                  }}
                />
                <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
