import axios from 'axios'

export const compare = (payload) => axios.post('/api/compare', payload).then(r => r.data)
