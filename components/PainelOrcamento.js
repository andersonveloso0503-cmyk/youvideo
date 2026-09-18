// components/PainelOrcamento.js
import { useEffect, useState } from 'react';

function corBarra(percentual) {
  if (percentual === null) return '#999';
  if (percentual > 50) return '#2e7d32';
  if (percentual > 20) return '#f9a825';
  return '#c62828';
}

function LinhaServico({ nome, dado }) {
  if (!dado) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
        <strong>{nome}</strong>
        <span style={{ color: '#666' }}>{dado.papel}</span>
      </div>
      {dado.gratis ? (
        <div style={{ fontSize: 13, color: '#2e7d32' }}>Grátis / sem custo direto</div>
      ) : dado.ok === false ? (
        <div style={{ fontSize: 13, color: '#c62828' }}>Não consegui buscar o saldo agora ({dado.erro})</div>
      ) : (
        <div style={{ fontSize: 15 }}>
          {dado.saldo !== null && dado.saldo !== undefined ? dado.saldo.toLocaleString('pt-BR') : '—'}{' '}
          {dado.moeda ?? ''}
          {dado.manual && (
            <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
              (manual, atualizado{' '}
              {dado.atualizado_em ? new Date(dado.atualizado_em).toLocaleDateString('pt-BR') : 'nunca'})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function PainelOrcamento() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ shotstack: '', suno: '', orcamento_mensal: '', gasto_mes_atual: '' });

  async function carregar() {
    setCarregando(true);
    try {
      const resp = await fetch('/api/orcamento');
      const json = await resp.json();
      setDados(json);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarManual(e) {
    e.preventDefault();
    const corpo = {};
    Object.entries(form).forEach(([chave, valor]) => {
      if (valor !== '') corpo[chave] = valor;
    });

    await fetch('/api/orcamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    setEditando(false);
    setForm({ shotstack: '', suno: '', orcamento_mensal: '', gasto_mes_atual: '' });
    carregar();
  }

  if (carregando) return <div style={{ padding: 16 }}>Carregando orçamento…</div>;
  if (!dados) return <div style={{ padding: 16 }}>Não consegui carregar o orçamento agora.</div>;

  const percentualRestante = dados.orcamento.mensal
    ? Math.max(0, (dados.orcamento.restante / dados.orcamento.mensal) * 100)
    : null;

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Orçamento do mês</h2>
        <button
          onClick={() => setEditando(!editando)}
          style={{ border: 'none', background: '#eee', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
        >
          {editando ? 'Fechar' : 'Atualizar saldo manual'}
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
          <span>Restante: R$ {dados.orcamento.restante.toFixed(2)}</span>
          <span>Teto: R$ {dados.orcamento.mensal.toFixed(2)}</span>
        </div>
        <div style={{ height: 10, background: '#eee', borderRadius: 6, overflow: 'hidden' }}>
          <div
            style={{
              width: `${percentualRestante}%`,
              height: '100%',
              background: corBarra(percentualRestante),
              transition: 'width 0.3s',
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 8,
          marginBottom: 20,
          background: dados.recomendacao === 'animado' ? '#e8f5e9' : '#fff3e0',
          color: dados.recomendacao === 'animado' ? '#2e7d32' : '#e65100',
          fontWeight: 600,
        }}
      >
        {dados.recomendacao === 'animado' ? '✅ Pode animar' : '⚠️ Use vídeo fixo'} — {dados.motivo}
      </div>

      <LinhaServico nome="fal.ai (animação)" dado={dados.servicos.fal} />
      <LinhaServico nome="Flux (imagens)" dado={dados.servicos.flux} />
      <LinhaServico nome="ElevenLabs (narração)" dado={dados.servicos.elevenlabs} />
      <LinhaServico nome="Shotstack (montagem)" dado={dados.servicos.shotstack} />
      <LinhaServico nome="Suno (música)" dado={dados.servicos.suno} />
      <LinhaServico nome="Pexels (b-roll)" dado={dados.servicos.pexels} />
      <LinhaServico nome="Groq (roteiro)" dado={dados.servicos.groq} />

      {editando && (
        <form onSubmit={salvarManual} style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Shotstack e Suno não têm API pública de saldo — dá uma olhada no painel de cada um e digita aqui.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              Créditos Shotstack
              <input
                type="number"
                value={form.shotstack}
                onChange={(e) => setForm({ ...form, shotstack: e.target.value })}
                style={{ width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Músicas restantes Suno
              <input
                type="number"
                value={form.suno}
                onChange={(e) => setForm({ ...form, suno: e.target.value })}
                style={{ width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Teto mensal (R$)
              <input
                type="number"
                value={form.orcamento_mensal}
                onChange={(e) => setForm({ ...form, orcamento_mensal: e.target.value })}
                style={{ width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Já gasto este mês (R$)
              <input
                type="number"
                value={form.gasto_mes_atual}
                onChange={(e) => setForm({ ...form, gasto_mes_atual: e.target.value })}
                style={{ width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
          </div>
          <button
            type="submit"
            style={{
              marginTop: 12,
              padding: '8px 16px',
              background: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}
