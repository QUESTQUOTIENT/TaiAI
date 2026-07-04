import React, { useState, useCallback } from 'react';
import { Upload, Link, Check, X, AlertCircle } from 'lucide-react';

export type MetadataMode = 'ipfs' | 'external';

interface MetadataModeSelectorProps {
  value: string; 
  mode: MetadataMode;
  onValueChange: (value: string) => void;
  onModeChange: (mode: MetadataMode) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}


export function MetadataModeSelector({
  value,
  mode,
  onValueChange,
  onModeChange,
  label = 'Metadata',
  placeholder = 'Enter IPFS CID or external URL',
  disabled = false,
}: MetadataModeSelectorProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    contentType?: string;
    message?: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const validateExternalUrl = useCallback(async (url: string) => {
    if (!url.startsWith('http')) {
      setValidationResult({ valid: false, message: 'Must be a valid URL starting with http:// or https://' });
      return;
    }

    setIsValidating(true);
    try {
      const res = await fetch(`/api/metadata/validate?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (data.success) {
        setValidationResult({
          valid: data.data.valid,
          contentType: data.data.contentType,
          message: data.data.valid ? 'URL is accessible' : 'URL is not accessible',
        });

        
        if (data.data.contentType?.includes('image/')) {
          setPreviewUrl(url);
        } else {
          setPreviewUrl(null);
        }
      } else {
        setValidationResult({ valid: false, message: data.error || 'Validation failed' });
        setPreviewUrl(null);
      }
    } catch (error: any) {
      setValidationResult({ valid: false, message: error.message });
      setPreviewUrl(null);
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleValueChange = (newValue: string) => {
    onValueChange(newValue);
    setValidationResult(null);
    setPreviewUrl(null);
  };

  const handleBlur = () => {
    if (mode === 'external' && value) {
      validateExternalUrl(value);
    }
  };

  const convertDriveLink = async () => {
    if (!value) return;
    try {
      const res = await fetch(`/api/metadata/convert?url=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (data.success) {
        onValueChange(data.data.converted);
        setValidationResult({ valid: true, message: `Converted: ${data.data.type} link normalized` });
      }
    } catch (error: any) {
      setValidationResult({ valid: false, message: 'Link conversion failed' });
    }
  };

  return (
    <div className="border border-slate-700 rounded-lg p-4 space-y-4 bg-slate-800/50">
      {}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {label} Storage Mode
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onModeChange('ipfs');
              setValidationResult(null);
              setPreviewUrl(null);
            }}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
              mode === 'ipfs'
                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                : 'border-slate-600 bg-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            <Upload size={18} />
            <span>IPFS Upload</span>
            {mode === 'ipfs' && <Check size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              onModeChange('external');
              setValidationResult(null);
              setPreviewUrl(null);
            }}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
              mode === 'external'
                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                : 'border-slate-600 bg-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            <Link size={18} />
            <span>External Link</span>
            {mode === 'external' && <Check size={16} />}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {mode === 'ipfs'
            ? 'Upload metadata to IPFS (recommended for permanence)'
            : 'Use an external URL (Google Drive, Dropbox, direct link). Less reliable but convenient.'}
        </p>
      </div>

      {}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {mode === 'ipfs' ? 'IPFS CID' : 'External URL'}
        </label>
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pr-24 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {mode === 'external' && value && (
            <button
              type="button"
              onClick={convertDriveLink}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
              title="Normalize Google Drive link"
            >
              Normalize
            </button>
          )}
          {isValidating && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin">
              <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.2-8.56" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {}
      {validationResult && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
          validationResult.valid
            ? 'bg-green-500/20 border border-green-500/50 text-green-300'
            : 'bg-red-500/20 border border-red-500/50 text-red-300'
        }`}>
          {validationResult.valid ? <Check size={16} className="mt-0.5" /> : <X size={16} className="mt-0.5" />}
          <div>
            <p className="font-medium">{validationResult.valid ? 'Valid' : 'Invalid'}</p>
            {validationResult.message && <p className="text-xs opacity-80">{validationResult.message}</p>}
            {validationResult.contentType && (
              <p className="text-xs opacity-80">Type: {validationResult.contentType}</p>
            )}
          </div>
        </div>
      )}

      {}
      {previewUrl && (
        <div className="border border-slate-600 rounded-lg p-3">
          <p className="text-sm text-slate-400 mb-2">Image Preview</p>
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-xs max-h-48 object-contain bg-slate-900 rounded"
            onError={() => setPreviewUrl(null)}
          />
        </div>
      )}

      {}
      {mode === 'external' && (
        <div className="flex items-start gap-2 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-200 text-xs">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">External Link Disclaimer</p>
            <p className="opacity-80 mt-1">
              External URLs may be rate-limited or become unavailable. For production NFTs, IPFS is strongly recommended.
              Always test the link before minting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
