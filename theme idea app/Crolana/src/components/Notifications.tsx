import React from 'react';
import { useAppStore } from '../store';
import { X, CheckCircle, AlertCircle, Info, Loader2, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../lib/utils';

export function Notifications() {
  const { notifications, removeNotification } = useAppStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md",
              notification.type === 'success' && "bg-green-500/10 border-green-500/20 text-green-100",
              notification.type === 'error' && "bg-red-500/10 border-red-500/20 text-red-100",
              notification.type === 'info' && "bg-blue-500/10 border-blue-500/20 text-blue-100",
              notification.type === 'loading' && "bg-slate-800/90 border-slate-700 text-slate-100",
              notification.type === 'warning' && "bg-yellow-500/10 border-yellow-500/20 text-yellow-100"
            )}
          >
            <div className="mt-0.5">
              {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-green-400" />}
              {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
              {notification.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
              {notification.type === 'loading' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
              {notification.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-400" />}
            </div>
            
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{notification.title}</h4>
              <p className="text-xs opacity-90 mt-0.5">{notification.message}</p>
            </div>

            <button 
              onClick={() => removeNotification(notification.id)}
              className="text-white/50 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
export default Notifications;
