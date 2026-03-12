import { useState, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
)

const LAB_ID = '5'

interface ScoreBucket {
  bucket: string
  count: number
}

interface ScoresResponse {
  lab_id: string
  buckets: ScoreBucket[]
}

interface TimelineEntry {
  date: string
  submissions: number
}

interface TimelineResponse {
  lab_id: string
  timeline: TimelineEntry[]
}

interface PassRateEntry {
  task_id: number
  task_name: string
  pass_count: number
  total_count: number
  pass_rate: number
}

interface PassRatesResponse {
  lab_id: string
  pass_rates: PassRateEntry[]
}

interface Lab {
  id: string
  name: string
}

type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

function Dashboard() {
  const [selectedLab, setSelectedLab] = useState<string>(LAB_ID)
  const [labs] = useState<Lab[]>([{ id: LAB_ID, name: `Lab ${LAB_ID}` }])

  const [scoresState, setScoresState] = useState<FetchState<ScoresResponse>>({
    status: 'idle',
  })
  const [timelineState, setTimelineState] = useState<FetchState<TimelineResponse>>({
    status: 'idle',
  })
  const [passRatesState, setPassRatesState] = useState<FetchState<PassRatesResponse>>({
    status: 'idle',
  })

  const apiKey = localStorage.getItem('api_key') ?? ''

  useEffect(() => {
    if (!apiKey || !selectedLab) return

    const fetchScores = async () => {
      setScoresState({ status: 'loading' })
      try {
        const res = await fetch(`/analytics/scores?lab=${selectedLab}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: ScoresResponse = await res.json()
        setScoresState({ status: 'success', data })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setScoresState({ status: 'error', message })
      }
    }

    const fetchTimeline = async () => {
      setTimelineState({ status: 'loading' })
      try {
        const res = await fetch(`/analytics/timeline?lab=${selectedLab}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: TimelineResponse = await res.json()
        setTimelineState({ status: 'success', data })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setTimelineState({ status: 'error', message })
      }
    }

    const fetchPassRates = async () => {
      setPassRatesState({ status: 'loading' })
      try {
        const res = await fetch(`/analytics/pass-rates?lab=${selectedLab}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: PassRatesResponse = await res.json()
        setPassRatesState({ status: 'success', data })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setPassRatesState({ status: 'error', message })
      }
    }

    fetchScores()
    fetchTimeline()
    fetchPassRates()
  }, [apiKey, selectedLab])

  const scoresData = scoresState.status === 'success' ? scoresState.data : null
  const timelineData = timelineState.status === 'success' ? timelineState.data : null
  const passRatesData = passRatesState.status === 'success' ? passRatesState.data : null

  const barChartData = scoresData
    ? {
        labels: scoresData.buckets.map((b) => b.bucket),
        datasets: [
          {
            label: 'Score Buckets',
            data: scoresData.buckets.map((b) => b.count),
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      }
    : null

  const lineChartData = timelineData
    ? {
        labels: timelineData.timeline.map((t) => t.date),
        datasets: [
          {
            label: 'Submissions per Day',
            data: timelineData.timeline.map((t) => t.submissions),
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1,
            fill: true,
          },
        ],
      }
    : null

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Analytics Dashboard</h1>
        <div className="lab-selector">
          <label htmlFor="lab-select">Select Lab: </label>
          <select
            id="lab-select"
            value={selectedLab}
            onChange={(e) => setSelectedLab(e.target.value)}
          >
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="charts-container">
        <section className="chart-section">
          <h2>Score Distribution</h2>
          {scoresState.status === 'loading' && <p>Loading scores...</p>}
          {scoresState.status === 'error' && <p>Error: {scoresState.message}</p>}
          {barChartData && <Bar data={barChartData} />}
        </section>

        <section className="chart-section">
          <h2>Submissions Timeline</h2>
          {timelineState.status === 'loading' && <p>Loading timeline...</p>}
          {timelineState.status === 'error' && <p>Error: {timelineState.message}</p>}
          {lineChartData && <Line data={lineChartData} />}
        </section>
      </div>

      <section className="pass-rates-section">
        <h2>Pass Rates per Task</h2>
        {passRatesState.status === 'loading' && <p>Loading pass rates...</p>}
        {passRatesState.status === 'error' && <p>Error: {passRatesState.message}</p>}
        {passRatesData && (
          <table className="pass-rates-table">
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Task Name</th>
                <th>Pass Count</th>
                <th>Total Count</th>
                <th>Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              {passRatesData.pass_rates.map((entry) => (
                <tr key={entry.task_id}>
                  <td>{entry.task_id}</td>
                  <td>{entry.task_name}</td>
                  <td>{entry.pass_count}</td>
                  <td>{entry.total_count}</td>
                  <td>{(entry.pass_rate * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default Dashboard
