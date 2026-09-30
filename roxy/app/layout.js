import './globals.css'
export const metadata = { title: 'Roxy Accesorios', description: 'Control de inventario y ventas', icons: { icon: '/logo.webp' } }
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }
export default function RootLayout({ children }) {
  return <html lang="es"><body>{children}</body></html>
}
