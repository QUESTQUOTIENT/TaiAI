import React, { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { UploadCloud, Check, Copy, ExternalLink, Settings, Folder, FileJson, Eye, EyeOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { IpfsProvider } from '../types';

export function IpfsManager() {
  const { 
    ipfsCid, 
    setIpfsCid, 
    ipfsConfig, 
    setIpfsConfig, 
    addNotification,
    updateNotification 
  } = useAppStore();

  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'reveal'>('upload');
  const [uploadedImagesCount, setUploadedImagesCount] = useState(0);
  const [uploadedMetadataCount, setUploadedMetadataCount] = useState(0);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [metadataFiles, setMetadataFiles] = useState<File[]>([]);
  
  
  const [hiddenImage, setHiddenImage] = useState<File | null>(null);
  const [hiddenMetadata, setHiddenMetadata] = useState<File | null>(null);

  
  const onImagesDrop = useCallback((acceptedFiles: File[]) => {
    setImageFiles(acceptedFiles);
    setUploadedImagesCount(acceptedFiles.length);
    addNotification({
      type: 'success',
      title: 'Images Ready',
      message: `Prepared ${acceptedFiles.length} images for upload.`,
      duration: 3000
    });
  }, [addNotification]);

  const onMetadataDrop = useCallback((acceptedFiles: File[]) => {
    setMetadataFiles(acceptedFiles);
    setUploadedMetadataCount(acceptedFiles.length);
    addNotification({
      type: 'success',
      title: 'Metadata Ready',
      message: `Prepared ${acceptedFiles.length} metadata files for upload.`,
      duration: 3000
    });
  }, [addNotification]);

  const { getRootProps: getImageRootProps, getInputProps: getImageInputProps } = useDropzone({
    onDrop: onImagesDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] }
  });

  const { getRootProps: getMetadataRootProps, getInputProps: getMetadataInputProps } = useDropzone({
    onDrop: onMetadataDrop,
    accept: { 'application/json': ['.json'] }
  });

  const { getRootProps: getHiddenImageRootProps, getInputProps: getHiddenImageInputProps } = useDropzone({
    onDrop: (files) => setHiddenImage(files[0]),
    maxFiles: 1,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] }
  });

  const { getRootProps: getHiddenMetadataRootProps, getInputProps: getHiddenMetadataInputProps } = useDropzone({
    onDrop: (files) => setHiddenMetadata(files[0]),
    maxFiles: 1,
    accept: { 'application/json': ['.json'] }
  });

  const handleUpload = async () => {
    if (ipfsConfig.provider === 'manual') {
        return;
    }

    setIsUploading(true);
    const notifId = addNotification({
      type: 'loading',
      title: 'Uploading to IPFS',
      message: `Uploading assets to ${ipfsConfig.provider}...`,
      duration: 0
    });

    try {
      
      await fetch('/api/ipfs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default',
          ...ipfsConfig
        })
      });

      let cidToSet = '';

      const pollJob = async (jobId: string): Promise<any> => {
        return new Promise((resolve, reject) => {
          const interval = setInterval(async () => {
            try {
              const res = await fetch(`/api/ipfs/job/${jobId}`);
              const data = await res.json();
              if (data.status === 'completed') {
                clearInterval(interval);
                resolve(data.result);
              } else if (data.status === 'failed') {
                clearInterval(interval);
                reject(new Error(data.error));
              }
            } catch (err) {
              clearInterval(interval);
              reject(err);
            }
          }, 2000);
        });
      };

      if (imageFiles.length > 0) {
        const formData = new FormData();
        formData.append('userId', 'default');
        imageFiles.forEach(file => formData.append('files', file));

        const res = await fetch('/api/ipfs/upload/images', {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Image upload failed');
        }
        
        const data = await res.json();
        
        updateNotification(notifId, {
            type: 'loading',
            title: 'Processing Images',
            message: `Images queued for upload. Job ID: ${data.jobId}`,
            duration: 0
        });

        const result = await pollJob(data.jobId);
        cidToSet = result.cid;
        
        updateNotification(notifId, {
            type: 'success',
            title: 'Images Uploaded',
            message: `Images pinned successfully. CID: ${result.cid}`,
            duration: 3000
        });
      }

      if (metadataFiles.length > 0) {
        const formData = new FormData();
        formData.append('userId', 'default');
        metadataFiles.forEach(file => formData.append('files', file));

        const res = await fetch('/api/ipfs/upload/metadata', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Metadata upload failed');
        }

        const data = await res.json();

        updateNotification(notifId, {
            type: 'loading',
            title: 'Processing Metadata',
            message: `Metadata queued for upload. Job ID: ${data.jobId}`,
            duration: 0
        });

        const result = await pollJob(data.jobId);
        cidToSet = result.cid; 

        updateNotification(notifId, {
            type: 'success',
            title: 'Metadata Uploaded',
            message: `Metadata pinned successfully. CID: ${result.cid}`,
            duration: 3000
        });
      }
      
      if (cidToSet) {
          setIpfsCid(cidToSet);
      }

    } catch (error: any) {
      updateNotification(notifId, {
        type: 'error',
        title: 'Upload Failed',
        message: error.message || 'Unknown error',
        duration: 5000
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRevealUpload = async () => {
    if (!hiddenImage || !hiddenMetadata) {
        addNotification({
            type: 'error',
            title: 'Missing Files',
            message: 'Please upload both hidden image and metadata.',
            duration: 3000
        });
        return;
    }

    setIsUploading(true);
    const notifId = addNotification({
        type: 'loading',
        title: 'Uploading Reveal Assets',
        message: 'Uploading hidden assets to IPFS...',
        duration: 0
    });

    try {
        
        const imgFormData = new FormData();
        imgFormData.append('userId', 'default');
        imgFormData.append('file', hiddenImage);

        const imgRes = await fetch('/api/ipfs/upload/hidden-image', {
            method: 'POST',
            body: imgFormData
        });

        if (!imgRes.ok) throw new Error('Hidden image upload failed');
        const imgData = await imgRes.json();

        
        const metaFormData = new FormData();
        metaFormData.append('userId', 'default');
        metaFormData.append('file', hiddenMetadata);

        const metaRes = await fetch('/api/ipfs/upload/hidden-metadata', {
            method: 'POST',
            body: metaFormData
        });

        if (!metaRes.ok) throw new Error('Hidden metadata upload failed');
        const metaData = await metaRes.json();

        updateNotification(notifId, {
            type: 'success',
            title: 'Reveal Assets Uploaded',
            message: `Hidden assets pinned. Metadata CID: ${metaData.cid}`,
            duration: 5000
        });

    } catch (error: any) {
        updateNotification(notifId, {
            type: 'error',
            title: 'Upload Failed',
            message: error.message,
            duration: 5000
        });
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">IPFS Manager</h1>
          <p className="text-slate-400">Upload assets, manage storage, and configure reveal settings.</p>
        </div>
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Upload & Pin
          </button>
          <button
            onClick={() => setActiveTab('reveal')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'reveal' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Reveal System
          </button>
        </div>
      </div>

      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400" />
                Configuration
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Storage Provider
                  </label>
                  <select 
                    value={ipfsConfig.provider}
                    onChange={(e) => {
                      const p = e.target.value as IpfsProvider;
                      
                      const gw = p === 'lighthouse'
                        ? 'https://gateway.lighthouse.storage/ipfs/'
                        : p === 'infura'
                        ? 'https://ipfs.io/ipfs/'
                        : 'https://gateway.pinata.cloud/ipfs/';
                      setIpfsConfig({ provider: p, gateway: gw });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="lighthouse">Lighthouse (Recommended)</option>
                    <option value="pinata">Pinata</option>
                    <option value="infura">Infura</option>
                    <option value="manual">Manual Input</option>
                  </select>
                </div>

                {ipfsConfig.provider !== 'manual' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        {ipfsConfig.provider === 'lighthouse' ? 'Lighthouse API Key' : 'API Key'}
                      </label>
                      <input
                        type="password"
                        value={ipfsConfig.apiKey}
                        onChange={(e) => setIpfsConfig({ apiKey: e.target.value })}
                        placeholder={ipfsConfig.provider === 'lighthouse' ? 'Get free key at lighthouse.storage' : ''}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      />
                      {ipfsConfig.provider === 'lighthouse' && (
                        <a
                          href="https://lighthouse.storage"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                        >
                          Get your free API key at lighthouse.storage →
                        </a>
                      )}
                    </div>

                    {ipfsConfig.provider === 'pinata' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-400 mb-1">
                            API Secret
                          </label>
                          <input
                            type="password"
                            value={ipfsConfig.secret}
                            onChange={(e) => setIpfsConfig({ secret: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-400 mb-1">
                            JWT (Optional)
                          </label>
                          <input
                            type="password"
                            value={ipfsConfig.jwt}
                            onChange={(e) => setIpfsConfig({ jwt: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </>
                    )}

                    {ipfsConfig.provider === 'infura' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                          Project Secret
                        </label>
                        <input
                          type="password"
                          value={ipfsConfig.secret}
                          onChange={(e) => setIpfsConfig({ secret: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Custom Gateway
                  </label>
                  <input
                    type="text"
                    value={ipfsConfig.gateway}
                    onChange={(e) => setIpfsConfig({ gateway: e.target.value })}
                    placeholder="https://gateway.pinata.cloud/ipfs/"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {}
              <div 
                {...getImageRootProps()}
                className="bg-slate-900 p-6 rounded-xl border border-dashed border-slate-700 hover:border-blue-500 hover:bg-slate-800/50 transition-all cursor-pointer text-center group"
              >
                <input {...getImageInputProps()} />
                <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <Folder className="w-6 h-6 text-slate-400 group-hover:text-blue-400" />
                </div>
                <h3 className="text-white font-bold mb-1">Upload Images</h3>
                <p className="text-sm text-slate-500">
                  {uploadedImagesCount > 0 ? `${uploadedImagesCount} files selected` : "Drag folder or select files"}
                </p>
              </div>

              {}
              <div 
                {...getMetadataRootProps()}
                className="bg-slate-900 p-6 rounded-xl border border-dashed border-slate-700 hover:border-blue-500 hover:bg-slate-800/50 transition-all cursor-pointer text-center group"
              >
                <input {...getMetadataInputProps()} />
                <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <FileJson className="w-6 h-6 text-slate-400 group-hover:text-blue-400" />
                </div>
                <h3 className="text-white font-bold mb-1">Upload Metadata</h3>
                <p className="text-sm text-slate-500">
                  {uploadedMetadataCount > 0 ? `${uploadedMetadataCount} files selected` : "Drag folder or select files"}
                </p>
              </div>
            </div>

            {}
            <button
              onClick={handleUpload}
              disabled={isUploading || (ipfsConfig.provider !== 'manual' && uploadedImagesCount === 0)}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Uploading to {ipfsConfig.provider}...
                </>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5" />
                  {ipfsConfig.provider === 'manual' ? 'Save Configuration' : 'Upload to IPFS'}
                </>
              )}
            </button>

            {}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h2 className="text-xl font-bold text-white mb-4">IPFS Details</h2>
              
              {ipfsCid ? (
                <div className="space-y-6">
                  <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-green-400">Content Pinned Successfully</h3>
                      <p className="text-sm text-green-300/80">Your assets are live on IPFS.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Root CID</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={ipfsCid} 
                        onChange={(e) => setIpfsCid(e.target.value)}
                        className="flex-1 bg-slate-950 px-3 py-2 rounded-lg text-slate-300 font-mono text-sm border border-slate-800 focus:border-blue-500 focus:outline-none"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(ipfsCid);
                          addNotification({ type: 'success', title: 'Copied', message: 'CID copied to clipboard', duration: 2000 });
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Gateway Preview</label>
                    <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-lg border border-slate-800">
                      <div className="text-sm text-slate-400 truncate flex-1">
                        {ipfsConfig.gateway}{ipfsCid}/
                      </div>
                      <a 
                        href={`${ipfsConfig.gateway}${ipfsCid}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                  <UploadCloud className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No CID available. Upload assets or enter manually.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reveal' && (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 text-center">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <EyeOff className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Delayed Reveal System</h2>
            <p className="text-slate-400 max-w-lg mx-auto mb-8">
              Upload a placeholder image and metadata that will be shown before the collection is revealed.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              {}
              <div 
                {...getHiddenImageRootProps()}
                className="bg-slate-950 p-6 rounded-xl border border-dashed border-slate-800 hover:border-blue-500 cursor-pointer transition-colors"
              >
                <input {...getHiddenImageInputProps()} />
                <h3 className="text-white font-bold mb-2">1. Hidden Image</h3>
                {hiddenImage ? (
                  <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-lg">
                    <img src={URL.createObjectURL(hiddenImage)} alt="Hidden" className="w-10 h-10 rounded object-cover" />
                    <span className="text-sm text-slate-300 truncate">{hiddenImage.name}</span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Upload the placeholder image (e.g., "Mystery Box")</p>
                )}
              </div>

              {}
              <div 
                {...getHiddenMetadataRootProps()}
                className="bg-slate-950 p-6 rounded-xl border border-dashed border-slate-800 hover:border-blue-500 cursor-pointer transition-colors"
              >
                <input {...getHiddenMetadataInputProps()} />
                <h3 className="text-white font-bold mb-2">2. Hidden Metadata</h3>
                {hiddenMetadata ? (
                  <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-lg">
                    <FileJson className="w-8 h-8 text-slate-500" />
                    <span className="text-sm text-slate-300 truncate">{hiddenMetadata.name}</span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Upload the generic metadata JSON file</p>
                )}
              </div>
            </div>

            <button 
                onClick={handleRevealUpload}
                disabled={isUploading || !hiddenImage || !hiddenMetadata}
                className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors"
            >
              {isUploading ? 'Uploading...' : 'Upload Reveal Assets'}
            </button>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
             <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                How it works
             </h3>
             <ul className="space-y-3 text-slate-400 text-sm list-disc list-inside">
                <li>The contract is deployed with the <strong>Hidden Metadata URI</strong> initially.</li>
                <li>All tokens will show the same hidden image and metadata.</li>
                <li>When you are ready, you call the <code>reveal()</code> function on the contract.</li>
                <li>The contract updates the Base URI to point to the real collection IPFS CID.</li>
                <li>Marketplaces will refresh metadata to show the actual NFTs.</li>
             </ul>
          </div>
        </div>
      )}
    </div>
  );
}
export default IpfsManager;
