import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api', // <--- Alteração aqui
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cmto_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const wasLoggedIn = !!localStorage.getItem('cmto_token');
      localStorage.removeItem('cmto_token');
      localStorage.removeItem('cmto_user');
      if (wasLoggedIn && window.location.pathname !== '/login') {
        toast.error('Sessão expirada. Faça login novamente.');
        window.location.href = '/login';
      }
    } else if (error.response?.status === 403) {
      toast.error(error.response.data?.error || 'Acesso negado');
    } else if (error.response?.data?.error) {
      toast.error(error.response.data.error);
    } else if (error.code === 'ERR_NETWORK') {
      toast.error('Servidor indisponível');
    }
    return Promise.reject(error);
  }
);

/**
 * Abre um PDF da API em nova aba enviando o token de login.
 * (Links <a href="/api/..."> comuns nao enviam o header Authorization.)
 * path: caminho relativo a /api, ex.: '/reports/student/123'
 */
export async function openPdf(path) {
  const win = window.open('', '_blank'); // abre na hora do clique para nao ser bloqueado
  try {
    const { data } = await api.get(path, { responseType: 'blob' });
    const blob = data.type ? data : new Blob([data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (err) {
    if (win) win.close();
    const status = err.response?.status;
    if (status !== 401 && status !== 403) {
      let msg = 'Nao foi possivel gerar o relatorio';
      try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* mantem msg */ }
      toast.error(msg);
    }
  }
}


function getPdfFilename(contentDisposition, fallback = 'documento.pdf') {
  if (!contentDisposition) return fallback;

  // RFC 5987: filename*=UTF-8''arquivo%20com%20espacos.pdf
  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try { return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, '')); } catch { /* segue */ }
  }

  const normalMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i)
    || contentDisposition.match(/filename\s*=\s*([^;]+)/i);
  return normalMatch?.[1]?.trim().replace(/^"|"$/g, '') || fallback;
}

/**
 * Baixa um PDF usando o nome informado pelo backend em Content-Disposition.
 * Assim o arquivo não fica com o nome aleatório da URL blob.
 */
export async function downloadPdf(path, fallbackFilename = 'documento.pdf') {
  try {
    const response = await api.get(path, { responseType: 'blob' });
    const data = response.data;
    const blob = data.type ? data : new Blob([data], { type: 'application/pdf' });
    const filename = getPdfFilename(response.headers?.['content-disposition'], fallbackFilename);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (err) {
    const status = err.response?.status;
    if (status !== 401 && status !== 403) {
      let msg = 'Nao foi possivel baixar o PDF';
      try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* mantem msg */ }
      toast.error(msg);
    }
  }
}

export default api;
