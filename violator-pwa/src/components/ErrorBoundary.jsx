import { Component } from 'react'
import { reportCrash } from '../monitoring'

// Catches a crash anywhere below it, reports it (src/monitoring.js) and shows
// `fallback` instead of a blank white page. A class, because React only
// offers this for class components.
export default class ErrorBoundary extends Component {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    reportCrash(error, info?.componentStack)
  }

  render() {
    return this.state.crashed ? this.props.fallback : this.props.children
  }
}
