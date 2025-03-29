const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

const SHOP = 'vdagama.myshopify.com';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-01';
const LIMIT = 250;
const FILENAME = 'feed.xml';

async function fetchAllProducts() {
  let products = [];
  let url = `https://${SHOP}/admin/api/${API_VERSION}/products.json?limit=${LIMIT}&fields=id,title,body_html,handle,vendor,variants,images`;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${error}`);
    }

    const data = await response.json();
    products = products.concat(data.products);

    // Έλεγχος για pagination
    const linkHeader = response.headers.get('link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = match ? match[1] : null;
    } else {
      hasNextPage = false;
    }
  }

  return products;
}

function escapeXML(str) {
  return str?.replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c])) || '';
}

function generateXML(products) {
  const items = products.flatMap((product) =>
    product.variants.map((variant) => {
      const availability =
        variant.inventory_management === null || variant.inventory_policy === 'continue'
          ? 'in stock'
          : variant.inventory_quantity > 0
            ? 'in stock'
            : 'out of stock';

      return `
      <item>
        <g:id>${variant.id}</g:id>
        <title>${escapeXML(product.title)}</title>
        <link>https://vdagama.com/products/${product.handle}?variant=${variant.id}</link>
        <description>${escapeXML(product.body_html || '')}</description>
        <g:brand>${escapeXML(product.vendor || 'VDagama')}</g:brand>
        <g:price>${variant.price} EUR</g:price>
        <g:availability>${availability}</g:availability>
        <g:condition>new</g:condition>
        <g:image_link>${product.images[0]?.src || ''}</g:image_link>
      </item>`;
    })
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>VDagama Product Feed</title>
    <link>https://vdagama.com</link>
    <description>Shopify feed for Facebook Catalog</description>
    ${items}
  </channel>
</rss>`;
}

(async () => {
  try {
    const products = await fetchAllProducts();
    const xml = generateXML(products);
    fs.writeFileSync(FILENAME, xml);
    console.log(`✅ XML feed created: ${FILENAME}`);
  } catch (error) {
    console.error('❌ Error generating feed:', error.message);
  }
})();

