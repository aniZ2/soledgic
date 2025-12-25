import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = process.env.SOLEDGIC_API_URL || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = process.env.SOLEDGIC_API_KEY

if (!API_KEY) {
  console.error('SECURITY: SOLEDGIC_API_KEY environment variable is required')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const res = await fetch(`${SOLEDGIC_URL}/generate-pdf`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }

    // If requesting direct download, return as PDF
    if (body.download) {
      const pdfBytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0))
      return new NextResponse(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${data.filename}"`,
        },
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('PDF API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate PDF' }, { status: 500 })
  }
}
