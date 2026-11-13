import { NextResponse } from 'next/server';
import { listPublishedMaterialTemplateSources } from '../../../../lib/material-workflow';

/**
 * 已发布模板的 SVG 源码，供浏览器本地实时预览使用。
 * 只会返回已发布版本的源码；草稿版本不会经由此接口泄露。
 */
export async function GET() {
  const items = await listPublishedMaterialTemplateSources();
  return NextResponse.json({ items });
}
