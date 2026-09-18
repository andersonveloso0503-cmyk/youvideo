// components/PainelOrcamento.js
import { useEffect, useState } from 'react';

function corBarra(percentual) {
  if (percentual === null) return 'var(--border)';
  if (percentual > 50) return 'var(--teal)';
  if (percentual > 20) return 'var(--gold)';
  return 'var(--terracotta)';
}

function LinhaServico({ nome, dado }) {
  if (!dado) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '10px 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>{nome}</div>
        {dado.gratis ? (
          <div style={{ fontSize: 13, color: 'var(--teal)' }}>Grátis / sem custo direto</div>
        ) : dado.ok === false ? (
          <div style={{ fontSize: 13, color: '#ff9d8c' }}>Sem saldo agora ({dado.erro})</div>
        ) : (
          <div style={{ fontSize: 15, color: 'var(--text)' }}>
            {dado.saldo !== null && dado.saldo !== undefined ? dado.saldo.toLocaleString('pt-BR') : '—'}{' '}
            {dado.moeda ?? ''}
            {dado.manual && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                (manual, {dado.atualizado_em ? new Date(dado.atualizado_em).toLocaleDateString('pt-BR') : 'nunca atualizado'})
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {dado.papel}
      </div>
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

  if (carregando) {
    return (
      <div className="card">
        <span className="spinner spinner--muted" /> Carregando orçamento…
      </div>
    );
  }
  if (!dados) {
    return <div className="card">Não consegui carregar o orçamento agora.</div>;
  }

  const percentualRestante = dados.orcamento.mensal
    ? Math.max(0, (dados.orcamento.restante / dados.orcamento.mensal) * 100)
    : null;

  const corRecomendacao = dados.recomendacao === 'animado' ? 'var(--teal-soft)' : 'var(--terracotta-soft)';
  const textoRecomendacao = dados.recomendacao === 'animado' ? '#8fd6c1' : '#ff9d8c';

  return (
    <div className="card">
      <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Orçamento do mês</span>
        <button
          onClick={() => setEditando(!editando)}
          style={{ marginTop: 0, background: 'var(--border)', color: 'var(--text)', fontSize: 12, padding: '6px 12px' }}
        >
          {editando ? 'Fechar' : 'Atualizar saldo manual'}
        </button>
      </h2>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
          <span>Restante: R$ {dados.orcamento.restante.toFixed(2)}</span>
          <span>Teto: R$ {dados.orcamento.mensal.toFixed(2)}</span>
        </div>
        <div style={{ height: 8, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
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
          padding: '10px 14px',
          borderRadius: 8,
          marginBottom: 8,
          background: corRecomendacao,
          color: textoRecomendacao,
          fontSize: 14,
        }}
      >
        {dados.recomendacao === 'animado' ? '✅ Pode animar' : '⚠️ Use vídeo fixo'} — {dados.motivo}
      </div>

      <div>
        <LinhaServico nome="fal.ai (animação)" dado={dados.servicos.fal} />
        <LinhaServico nome="Flux (imagens)" dado={dados.servicos.flux} />
        <LinhaServico nome="ElevenLabs (narração)" dado={dados.servicos.elevenlabs} />
        <LinhaServico nome="Shotstack (montagem)" dado={dados.servicos.shotstack} />
        <LinhaServico nome="Suno (música)" dado={dados.servicos.suno} />
        <LinhaServico nome="Pexels (b-roll)" dado={dados.servicos.pexels} />
        <LinhaServico nome="Groq (roteiro)" dado={dados.servicos.groq} />
      </div>

      {editando && (
        <form onSubmit={salvarManual} style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
            Shotstack e Suno não têm API pública de saldo — dá uma olhada no painel de cada um e digita aqui.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div>
              <label>Créditos Shotstack</label>
              <input
                type="text"
                value={form.shotstack}
                onChange={(e) => setForm({ ...form, shotstack: e.target.value })}
              />
            </div>
            <div>
              <label>Músicas restantes Suno</label>
              <input
                type="text"
                value={form.suno}
                onChange={(e) => setForm({ ...form, suno: e.target.value })}
              />
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div>
              <label>Teto mensal (R$)</label>
              <input
                type="text"
                value={form.orcamento_mensal}
                onChange={(e) => setForm({ ...form, orcamento_mensal: e.target.value })}
              />
            </div>
            <div>
              <label>Já gasto este mês (R$)</label>
              <input
                type="text"
                value={form.gasto_mes_atual}
                onChange={(e) => setForm({ ...form, gasto_mes_atual: e.target.value })}
              />
            </div>
          </div>
          <button type="submit">Salvar</button>
        </form>
      )}
    </div>
  );
}
