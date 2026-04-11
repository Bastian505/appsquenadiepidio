// api/scan-receipt.js
// Vercel Serverless Function — DiviCuenta Proxy

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada', code: 'NO_KEY' });
  }

  const { image_base64, media_type = 'image/jpeg' } = req.body;

  if (!image_base64) {
    return res.status(400).json({ error: 'image_base64 requerido' });
  }

  if (image_base64.length > 4_000_000) {
    return res.status(413).json({ error: 'Imagen muy grande. Máximo 3MB.', code: 'IMAGE_TOO_LARGE' });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'Eres un experto en análisis de boletas de restaurantes chilenos. Responde SOLO con JSON válido sin markdown ni texto extra. Formato: {"restaurante":"nombre o null","items":[{"nombre":"nombre del plato","precio_unitario":numero_entero_CLP,"cantidad":numero_entero}]}. Si no puedes leer la boleta devuelve {"restaurante":null,"items":[]}.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Analiza esta boleta y extrae todos los ítems con sus precios exactos.' }
          ]
        }]
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json().catch(() => ({}));
      return res.status(502).json({
        error: errData?.error?.message ?? `HTTP ${anthropicRes.status}`,
        code: 'ANTHROPIC_ERROR'
      });
    }

    const data = await anthropicRes.json();
    const textBlock = data.content?.find(b => b.type === 'text');

    if (!textBlock?.text) {
      return res.status(502).json({ error: 'Sin respuesta de Claude', code: 'NO_TEXT' });
    }

    const raw = textBlock.text;
    let parsed = null;

    try { parsed = JSON.parse(raw.trim()); } catch (_) {}
    if (!parsed) {
      try { parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim()); } catch (_) {}
    }
    if (!parsed) {
      try {
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
        if (s > -1 && e > s) parsed = JSON.parse(raw.substring(s, e + 1));
      } catch (_) {}
    }

    if (!parsed || !parsed.items || !parsed.items.length) {
      return res.status(422).json({ error: 'No se pudieron extraer ítems', code: 'PARSE_ERROR' });
    }

    return res.status(200).json({
      ok: true,
      restaurante: parsed.restaurante ?? null,
      items: parsed.items
    });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno', code: 'INTERNAL' });
  }
}
