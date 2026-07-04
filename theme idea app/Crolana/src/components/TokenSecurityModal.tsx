import React from 'react';
import { X, Shield, AlertTriangle, CheckCircle, XCircle, Loader2, Copy } from 'lucide-react';
import { analyzeTokenSecurity, type TokenSecurityReport } from '../security/tokenSecurityAnalyzer';
import { ethers } from 'ethers';
import { getDexProvider } from '../lib/provider';
import { cn } from '../lib/utils';
import { RefreshCw } from 'lucide-react';

interface TokenSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenAddress: string;
  tokenSymbol: string;
  chainId: number;
  nativeCurrencySymbol?: string; 
}

export function TokenSecurityModal({
  isOpen,
  onClose,
  tokenAddress,
  tokenSymbol,
  chainId,
  nativeCurrencySymbol = 'CRO',
}: TokenSecurityModalProps) {
  const [analyzing, setAnalyzing] = React.useState(false);
  const [report, setReport] = React.useState<TokenSecurityReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runAnalysis = React.useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setReport(null);
    try {
      const provider = getDexProvider(chainId) as ethers.JsonRpcProvider;
      const result = await analyzeTokenSecurity(tokenAddress, provider, nativeCurrencySymbol);
      setReport(result);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [tokenAddress, chainId, nativeCurrencySymbol]);

  React.useEffect(() => {
    if (isOpen) {
      runAnalysis();
    }
  }, [isOpen, runAnalysis]);

  if (!isOpen) return null;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'safe': return 'text-green-400';
      case 'low': return 'text-blue-400';
      case 'medium': return 'text-yellow-400';
      case 'high': return 'text-orange-400';
      case 'critical': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'medium':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'low':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Token Security Scan</h2>
              <p className="text-xs text-slate-400">
                Analyzing {tokenSymbol} ({tokenAddress.slice(0, 6)}…{tokenAddress.slice(-4)})
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(tokenAddress)}
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"
                title="Copy contract address"
              >
                <span className="font-mono">{tokenAddress.slice(0, 10)}…{tokenAddress.slice(-8)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {analyzing && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              <p className="text-slate-300">Scanning token contract for vulnerabilities…</p>
              <p className="text-xs text-slate-500">Checks: honeypot, mintable, blacklist, transfer fees, ownership, proxy</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-semibold">Analysis Failed</p>
                <p className="text-red-300/80 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {report && !analyzing && (
            <>
              {}
              <div className={cn(
                "p-4 rounded-xl border",
                report.riskLevel === 'safe' || report.riskLevel === 'low'
                  ? 'bg-green-500/10 border-green-500/20'
                  : report.riskLevel === 'medium'
                  ? 'bg-yellow-500/10 border-yellow-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className={cn("w-5 h-5", getRiskColor(report.riskLevel))} />
                    <span className="font-bold text-white">Risk Level: {report.riskLevel.toUpperCase()}</span>
                  </div>
                  <span className={cn("text-2xl font-bold", getRiskColor(report.riskLevel))}>
                    {report.score}/100
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{report.summary}</p>
              </div>

              {}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Security Checks</h3>
                {report.checks.map((check, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <div className="flex-shrink-0 mt-0.5">{getSeverityIcon(check.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{check.name}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          check.passed
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        )}>
                          {check.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {}
              {report.recommendations.length > 0 && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-sm font-semibold text-blue-300 mb-2">Recommendations</h3>
                  <ul className="space-y-1">
                    {report.recommendations.map((rec, idx) => (
                      <li key={idx} className="text-xs text-blue-200/80 flex items-start gap-2">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {}
              {report.riskLevel === 'critical' || report.riskLevel === 'high' ? (
                <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <div>
                      <p className="text-red-400 font-semibold text-sm">High Risk Token Detected</p>
                      <p className="text-red-300/80 text-xs mt-1">
                        This token exhibits characteristics of a honeypot, scam, or severely compromised contract.
                        Swapping could result in permanent loss of funds. <strong>Do not proceed unless you fully understand the risks.</strong>
                      </p>
                    </div>
                  </div>
                </div>
              ) : report.riskLevel === 'medium' ? (
                <div className="p-4 bg-yellow-500/15 border border-yellow-500/30 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-yellow-400 font-semibold text-sm">Exercise Caution</p>
                      <p className="text-yellow-300/80 text-xs mt-1">
                        This token has some concerning features. Research the project thoroughly and understand the risks before swapping.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rescan
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
