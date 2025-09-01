import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class GlobalErrorBoundary extends React.Component<{children: React.ReactNode}, {error: any}> {
  constructor(props:any){ super(props); this.state = { error: null } }
  static getDerivedStateFromError(error:any){ return { error } }
  componentDidCatch(error:any, info:any){ console.error('App error:', error, info) }
  render(){
    if (this.state.error) {
      return (
        <div style={{padding:16, color:'#b91c1c', background:'#fee2e2', border:'1px solid #fecaca'}}>
          <b>Unerwarteter Fehler</b>
          <pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
)
