

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { registerBackButtonHandler } from '../lib/capacitor';

export function BackButtonHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    
    const handler = () => {
      
      
      const overlays = document.querySelectorAll('div.fixed.inset-0.z-50');
      for (const overlay of overlays) {
        
        const style = window.getComputedStyle(overlay);
        if (style.backgroundColor.includes('0') || overlay.classList.contains('bg-black')) {
          (overlay as HTMLElement).click();
          return true;
        }
      }

      
      if (isMobile) {
        const sidebarOverlay = document.querySelector('[class*="bg-black/60"]');
        if (sidebarOverlay) {
          window.dispatchEvent(new CustomEvent('toggle-sidebar'));
          return true;
        }
      }

      
      if (window.history.length > 1 && location.pathname !== '/') {
        navigate(-1);
        return true;
      }

      
      return false;
    };

    registerBackButtonHandler(handler);

    
  }, [isMobile, location.pathname, navigate]);

  
  return null;
}
