import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { Activity, Users, Zap, Coins, RefreshCw, AlertTriangle, ExternalLink, CheckCircle, PauseCircle } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#f97316', '#10b981'];

export function Analytics() {
  const { deployedAddress, network } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    if (!deployedAddress) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?address=${deployedAddress}&networkId=${network.chainId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch analytics');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, [deployedAddress, network.chainId]);

  if (!deployedAddress) {
    return (
      <div className="h-[calc(100vh-100px)] flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-yellow-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Contract Deployed</h2>
        <p className="text-slate-400 max-w-md text-sm">Deploy your contract first to see live on-chain analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Analytics</h1>
          <p className="text-slate-400 text-sm">Live on-chain data from your deployed contract.</p>
        </div>
        <div className="flex items-center gap-3">
          {data?.overview?.dataSource === 'on-chain' && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live On-Chain
            </span>
          )}
          <button onClick={fetchAnalytics} disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load analytics</p>
            <p className="text-red-400/70 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex flex-col items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Reading contract events from Cronos…</p>
        </div>
      )}

      {data && (
        <>
          {}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Minted', value: `${data.overview.totalSupply}`, icon: Activity, color: 'blue', sub: data.overview.paused ? 'PAUSED' : (data.overview.revealed ? 'REVEALED' : 'HIDDEN') },
              { label: 'Unique Owners', value: `${data.overview.uniqueOwners}`, icon: Users, color: 'purple', sub: `${((data.overview.uniqueOwners / Math.max(data.overview.totalSupply, 1)) * 100).toFixed(0)}% holder ratio` },
              { label: 'Total Raised', value: `${parseFloat(data.overview.totalRaised).toFixed(2)} ${network.symbol}`, icon: Coins, color: 'green', sub: `${data.overview.mintCost} ${network.symbol} per mint` },
              { label: 'Contract Balance', value: `${parseFloat(data.overview.contractBalance).toFixed(4)} ${network.symbol}`, icon: Zap, color: 'orange', sub: 'Available to withdraw' },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                <div className={`p-2 w-fit bg-${color}-500/10 rounded-lg mb-3`}>
                  <Icon className={`w-5 h-5 text-${color}-400`} />
                </div>
                <div className="text-xl font-bold text-white mb-0.5">{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
                <div className={`text-[10px] mt-1 ${color === 'blue' ? (data.overview.paused ? 'text-red-400' : 'text-green-400') : 'text-slate-600'}`}>{sub}</div>
              </div>
            ))}
          </div>

          {}
          <div className="flex items-center gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-sm">
            <div className="flex-1 min-w-0">
              <span className="text-white font-bold">{data.overview.name}</span>
              <span className="text-slate-500 ml-2">({data.overview.symbol})</span>
              <span className="ml-3 font-mono text-slate-500 text-xs">{deployedAddress}</span>
            </div>
            <a href={`${network.explorerUrl}/address/${deployedAddress}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 transition-colors">
              Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {}
            <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h3 className="text-lg font-bold text-white mb-5">Mint Activity (Last 7 Days)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.mintChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff', fontSize: 12 }} />
                    <Bar dataKey="mints" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Mints" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h3 className="text-lg font-bold text-white mb-5">Holder Distribution</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.participation} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                      {data.participation.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-3">
                {data.participation.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-400">{p.name}</span>
                    </div>
                    <span className="text-white font-semibold">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {}
          {data.recentActivity?.length > 0 && (
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h3 className="text-lg font-bold text-white mb-4">Recent Contract Events</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs">
                      <th className="pb-3 font-semibold">TX Hash</th>
                      <th className="pb-3 font-semibold">Event</th>
                      <th className="pb-3 font-semibold">Token ID</th>
                      <th className="pb-3 font-semibold">From</th>
                      <th className="pb-3 font-semibold text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {data.recentActivity.map((tx: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-2.5">
                          <a href={`${network.explorerUrl}/tx/${tx.txHash}`} target="_blank" rel="noreferrer"
                            className="text-blue-400 hover:text-blue-300 font-mono text-xs flex items-center gap-1 transition-colors">
                            {tx.txHash.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tx.type === 'Mint' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300 text-xs">#{tx.tokenId}</td>
                        <td className="py-2.5 text-slate-400 font-mono text-xs">{tx.from?.slice(0, 8)}…</td>
                        <td className="py-2.5 text-right text-white text-xs font-semibold">
                          {parseFloat(tx.value) > 0 ? `${parseFloat(tx.value).toFixed(3)} ${network.symbol}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export default Analytics;
