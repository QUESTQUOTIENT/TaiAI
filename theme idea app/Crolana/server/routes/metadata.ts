import { Router, Request, Response } from 'express';

const router = Router();


const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';


router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fallback } = req.query;

    
    const url = `${METADATA_SERVICE_URL}/api/metadata/${encodeURIComponent(id)}${fallback ? `?fallback=${encodeURIComponent(String(fallback))}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Metadata proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'METADATA_PROXY_FAILED',
      message: 'Failed to resolve metadata',
    });
  }
});


router.post('/batch', async (req: Request, res: Response) => {
  try {
    const url = `${METADATA_SERVICE_URL}/api/metadata/batch`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Metadata batch proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'BATCH_PROXY_FAILED',
      message: 'Failed to batch resolve metadata',
    });
  }
});


router.get('/validate', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    const targetUrl = `${METADATA_SERVICE_URL}/api/metadata/validate?url=${encodeURIComponent(String(url))}`;

    const response = await fetch(targetUrl);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Metadata validate proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'VALIDATE_PROXY_FAILED',
      message: 'Failed to validate metadata URL',
    });
  }
});


router.get('/convert', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    const targetUrl = `${METADATA_SERVICE_URL}/api/metadata/convert?url=${encodeURIComponent(String(url))}`;

    const response = await fetch(targetUrl);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Metadata convert proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'CONVERT_PROXY_FAILED',
      message: 'Failed to convert metadata link',
    });
  }
});

export default router;
