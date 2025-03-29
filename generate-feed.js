const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config(); // Αν θες να χρησιμοποιήσεις .env αρχείο

const SHOP = 'vdagama.myshopify.com';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const API_VERSION = '2024-01';
const LIMIT = 250;
const FILENAME = 'feed.xml';

async function fetchAllProducts() {
  let products = [];
  let pageInfo = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const url = new URL(`https://${SHOP}/admin/api/${API_VERSION}/products.json`);
    url.searchParams.append('limit', LIMIT);
    url.searchParams.append('fields', 'id,title,body_html,handle,vendor,variants,images');
    if (pageInfo) {
      url.searchParams.append('page_info', pageInfo);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      }
    });

    const linkHeader = response.headers.get('link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const matched = linkHeader.match(/page_info=([^&>]+)/);
      pageInfo = matched ? matched[1] : null;
    } else {
      hasNextPage = false;
    }

    const data = await response.json();
    products = products.concat(data.products);
  }

  return products;
}

function escapeXML(str) {
  return str?.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c])) || '';
}

function generateXML(products) {
  const items = products.flatMap(product =>
    product.variants.map(variant => `
      <item>
        <g:id>${variant.id}</g:id>
        <title>${escapeXML(product.title)}</title>
        <link>https://vdagama.com/products/${product.handle}?variant=${variant.id}</link>
        <description>${escapeXML(product.body_html || '')}</description>
        <g:brand>${escapeXML(product.vendor || 'VDagama')}</g:brand>
        <g:price>${variant.price} EUR</g:price>
        <g:availability>${variant.inventory_quantity > 0 ? 'in stock' : 'out of stock'}</g:availability>
        <g:condition>new</g:condition>
        <g:image_link>${product.images[0]?.src || ''}</g:image_link>
      </item>
    `)
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>VDagama Product Feed</title>
    <link>https://vdagama.com</link>
    <description>Facebook Catalog Feed</description>
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
