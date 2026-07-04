import { Request, Response, NextFunction } from 'express';
import fs from 'fs';

const REQUIRED_FIELDS = ['name', 'description', 'image'];

export const validateMetadataMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No metadata files uploaded' });
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    if (!file.originalname.endsWith('.json')) {
      errors.push(`File "${file.originalname}": must be a .json file`);
      continue;
    }

    let json: any;
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      json = JSON.parse(content);
    } catch {
      errors.push(`File "${file.originalname}": invalid JSON format`);
      continue;
    }

    
    for (const field of REQUIRED_FIELDS) {
      if (!json[field]) errors.push(`File "${file.originalname}": missing required field '${field}'`);
    }

    
    if (json.image && typeof json.image === 'string') {
      if (!json.image.startsWith('ipfs://') && !json.image.startsWith('http')) {
        errors.push(`File "${file.originalname}": 'image' must be an IPFS URI (ipfs://...) or HTTP URL`);
      }
    }

    
    if (json.attributes !== undefined) {
      if (!Array.isArray(json.attributes)) {
        errors.push(`File "${file.originalname}": 'attributes' must be an array`);
      } else {
        json.attributes.forEach((attr: any, idx: number) => {
          if (!attr.trait_type) errors.push(`File "${file.originalname}": attribute[${idx}] missing 'trait_type'`);
          if (attr.value === undefined || attr.value === null || attr.value === '') {
            errors.push(`File "${file.originalname}": attribute[${idx}] missing 'value'`);
          }
        });
      }
    } else {
      warnings.push(`File "${file.originalname}": no 'attributes' field (recommended for NFT metadata)`);
    }
  }

  if (errors.length > 0) {
    
    files.forEach((file) => { try { fs.unlinkSync(file.path); } catch {} });
    return res.status(400).json({ error: 'Metadata validation failed', details: errors, warnings });
  }

  
  (req as any).metadataWarnings = warnings;
  next();
};
