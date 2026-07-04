import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { ethers } from 'ethers';
import { Upload, Send, AlertTriangle, CheckCircle } from 'lucide-react';
import Papa from 'papaparse';
import { AirdropRecipient } from '../../types';

export function AirdropManager() {
  const { deployedAddress, addNotification } = useAppStore();
  const [recipients, setRecipients] = useState<AirdropRecipient[]>([]);
  const [isAirdropping, setIsAirdropping] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRecipients: AirdropRecipient[] = [];
        let skippedCount = 0;

        results.data.forEach((row: any) => {
          const address = row.address || row.Address || row[0];
          const amountStr = row.amount || row.Amount || row[1] || '1';

          if (address && ethers.isAddress(address)) {
            const amount = parseInt(amountStr, 10);
            if (!isNaN(amount) && amount > 0) {
              parsedRecipients.push({ address, amount });
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        });

        setRecipients(parsedRecipients);

        if (skippedCount > 0) {
          addNotification({
            type: 'info',
            title: 'CSV Parsing Issues',
            message: `${parsedRecipients.length} valid recipients loaded, ${skippedCount} rows skipped (invalid address or amount).`,
            duration: 5000
          });
        } else {
          addNotification({
            type: 'success',
            title: 'CSV Loaded',
            message: `Successfully loaded ${parsedRecipients.length} recipients.`,
            duration: 3000
          });
        }
      },
      error: (error) => {

        addNotification({
          type: 'error',
          title: 'CSV Error',
          message: 'Failed to parse CSV file.',
          duration: 5000
        });
      }
    });
  };

  const handleAirdrop = async () => {
    if (!deployedAddress || recipients.length === 0) return;
    setIsAirdropping(true);
    setProgress(0);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const contract = new ethers.Contract(
        deployedAddress,
        ['function ownerMint(address to, uint256 _mintAmount) public'],
        signer
      );

      
      const BATCH_SIZE = 50;
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        
        
        
        
        
        
        
        for (const recipient of batch) {
             const tx = await contract.ownerMint(recipient.address, recipient.amount);
             await tx.wait();
        }
        
        setProgress(Math.min(100, Math.round(((i + batch.length) / recipients.length) * 100)));
      }

      addNotification({
        type: 'success',
        title: 'Airdrop Complete',
        message: `Successfully airdropped to ${recipients.length} addresses.`,
        duration: 5000
      });
      setRecipients([]);
      setProgress(0);
    } catch (error: any) {

      addNotification({
        type: 'error',
        title: 'Airdrop Failed',
        message: error.message || 'An error occurred during the airdrop.',
        duration: 5000
      });
    } finally {
      setIsAirdropping(false);
    }
  };

  const totalTokens = recipients.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-blue-500" />
          Airdrop Manager
        </h3>
        
        <div className="space-y-6">
          {}
          <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-blue-500 transition-colors relative">
            <input 
              type="file" 
              accept=".csv"
              onChange={handleCSVUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isAirdropping}
            />
            <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
            <p className="text-white font-medium mb-1">Upload Airdrop List (CSV)</p>
            <p className="text-sm text-slate-400">Format: address, amount (e.g., 0x123..., 2)</p>
          </div>

          {}
          {recipients.length > 0 && (
            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="text-sm">
                  <span className="text-slate-400">Total Recipients: </span>
                  <span className="text-white font-bold">{recipients.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">Total Tokens: </span>
                  <span className="text-white font-bold">{totalTokens}</span>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 sticky top-0">
                    <tr>
                      <th className="p-3 text-slate-400 font-medium">Address</th>
                      <th className="p-3 text-slate-400 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {recipients.slice(0, 100).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="p-3 text-slate-300 font-mono">{r.address}</td>
                        <td className="p-3 text-slate-300 text-right">{r.amount}</td>
                      </tr>
                    ))}
                    {recipients.length > 100 && (
                      <tr>
                        <td colSpan={2} className="p-3 text-center text-slate-500 italic">
                          ... and {recipients.length - 100} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="flex-1 mr-4">
              {isAirdropping && (
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
            <button 
              onClick={handleAirdrop}
              disabled={isAirdropping || recipients.length === 0}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              {isAirdropping ? (
                <>Processing {progress}%</>
              ) : (
                <>Execute Airdrop <Send className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
