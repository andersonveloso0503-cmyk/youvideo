/* Animação do botão "Curtir + Inscreva-se" (5 segundos).
   Desenhada num retângulo 3:1. A mesma função é usada na prévia e para gerar
   os quadros que vão para o vídeo final. */
(function () {
  const DUR = 5;
  const TEXTOS = {
    pt: { like: 'Curtir', liked: 'Curtido', sub: 'Inscreva-se', subbed: 'Inscrito' },
    en: { like: 'Like', liked: 'Liked', sub: 'Subscribe', subbed: 'Subscribed' },
  };

  const lim = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const faixa = (t, a, b) => lim((t - a) / (b - a));
  const suave = (x) => x * x * (3 - 2 * x);
  const volta = (x) => {
    // ease-out com leve "pulo" no fim
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  function pilula(ctx, x, y, w, h) {
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function joinha(ctx, cx, cy, s, cheio, cor) {
    // Ícone de "joinha" desenhado com formas simples
    ctx.save();
    ctx.translate(cx - s * 0.5, cy - s * 0.5);
    ctx.lineWidth = s * 0.09;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cor;
    ctx.fillStyle = cor;
    // punho
    ctx.beginPath();
    ctx.moveTo(s * 0.32, s * 0.42);
    ctx.lineTo(s * 0.5, s * 0.08);
    ctx.quadraticCurveTo(s * 0.62, s * 0.06, s * 0.6, s * 0.22);
    ctx.lineTo(s * 0.56, s * 0.38);
    ctx.lineTo(s * 0.86, s * 0.38);
    ctx.quadraticCurveTo(s * 0.96, s * 0.4, s * 0.93, s * 0.5);
    ctx.lineTo(s * 0.84, s * 0.84);
    ctx.quadraticCurveTo(s * 0.81, s * 0.92, s * 0.72, s * 0.92);
    ctx.lineTo(s * 0.32, s * 0.92);
    ctx.closePath();
    cheio ? ctx.fill() : ctx.stroke();
    // manga
    ctx.beginPath();
    ctx.rect(s * 0.07, s * 0.42, s * 0.17, s * 0.5);
    cheio ? ctx.fill() : ctx.stroke();
    ctx.restore();
  }

  function sino(ctx, cx, cy, s, angulo, cor) {
    ctx.save();
    ctx.translate(cx, cy - s * 0.35);
    ctx.rotate(angulo);
    ctx.translate(0, s * 0.35);
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, s * 0.28);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.18, -s * 0.3, -s * 0.05);
    ctx.quadraticCurveTo(-s * 0.3, -s * 0.42, 0, -s * 0.42);
    ctx.quadraticCurveTo(s * 0.3, -s * 0.42, s * 0.3, -s * 0.05);
    ctx.quadraticCurveTo(s * 0.3, s * 0.18, s * 0.38, s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, s * 0.36, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function cursor(ctx, x, y, s, apertado) {
    // Setinha do mouse (ponta em x,y)
    ctx.save();
    ctx.translate(x, y);
    const k = apertado ? 0.86 : 1;
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, s * 0.95);
    ctx.lineTo(s * 0.26, s * 0.72);
    ctx.lineTo(s * 0.44, s * 1.1);
    ctx.lineTo(s * 0.6, s * 1.02);
    ctx.lineTo(s * 0.42, s * 0.66);
    ctx.lineTo(s * 0.74, s * 0.66);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = s * 0.07;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = s * 0.2;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Desenha a animação no tempo t (0..5 s) dentro do retângulo (x, y, w, h≈w/3).
   * Fora de 0..5 não desenha nada.
   */
  function desenhar(ctx, x, y, w, h, t, idioma) {
    if (t < 0 || t > DUR) return;
    const tx = TEXTOS[idioma] || TEXTOS.pt;
    const entrada = volta(faixa(t, 0, 0.45));
    const saida = suave(faixa(t, 4.45, 5));
    const escala = Math.max(0.001, entrada * (1 - saida * 0.25));
    const alfa = lim(faixa(t, 0, 0.25)) * (1 - saida);
    if (alfa <= 0) return;

    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(escala * 0.88, escala * 0.88); // margem para o "pulo" da entrada não cortar
    ctx.translate(-w / 2, -h / 2);

    const fonte = (px) => `700 ${Math.round(px)}px Inter, "Segoe UI", Arial, sans-serif`;
    const bh = h * 0.46;
    const by = (h - bh) / 2;
    const gap = w * 0.03;
    const likeW = w * 0.35;
    const subW = w - likeW - gap - w * 0.02;
    const likeX = 0;
    const subX = likeX + likeW + gap;

    const cliqueLike = t >= 1.3;
    const cliqueSub = t >= 2.45;

    // Botão curtir
    const pulsoL = cliqueLike ? 1 + 0.08 * Math.sin(Math.PI * faixa(t, 1.3, 1.55)) : 1;
    ctx.save();
    ctx.translate(likeX + likeW / 2, by + bh / 2);
    ctx.scale(pulsoL, pulsoL);
    ctx.translate(-(likeX + likeW / 2), -(by + bh / 2));
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = h * 0.08;
    ctx.shadowOffsetY = h * 0.02;
    pilula(ctx, likeX, by, likeW, bh);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const corLike = cliqueLike ? '#1a73e8' : '#0f0f0f';
    joinha(ctx, likeX + bh * 0.62, by + bh / 2, bh * 0.52, cliqueLike, corLike);
    ctx.fillStyle = corLike;
    ctx.font = fonte(bh * 0.4);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(cliqueLike ? tx.liked : tx.like, likeX + bh * 1.05, by + bh / 2 + bh * 0.02, likeW - bh * 1.2);
    ctx.restore();

    // Botão inscrever
    const pulsoS = cliqueSub ? 1 + 0.08 * Math.sin(Math.PI * faixa(t, 2.45, 2.7)) : 1;
    ctx.save();
    ctx.translate(subX + subW / 2, by + bh / 2);
    ctx.scale(pulsoS, pulsoS);
    ctx.translate(-(subX + subW / 2), -(by + bh / 2));
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = h * 0.08;
    ctx.shadowOffsetY = h * 0.02;
    pilula(ctx, subX, by, subW, bh);
    ctx.fillStyle = cliqueSub ? '#e5e5e5' : '#ff0033';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = cliqueSub ? '#0f0f0f' : '#ffffff';
    ctx.font = fonte(bh * 0.4);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const textoSub = cliqueSub ? tx.subbed : tx.sub;
    const larguraSino = cliqueSub ? bh * 0.62 : 0;
    ctx.fillText(textoSub, subX + subW / 2 + larguraSino / 2, by + bh / 2 + bh * 0.02, subW - bh * 0.6 - larguraSino);
    if (cliqueSub) {
      const medida = Math.min(ctx.measureText(textoSub).width, subW - bh * 0.6 - larguraSino);
      const sx = subX + subW / 2 + larguraSino / 2 - medida / 2 - bh * 0.38;
      const balanco = Math.sin((t - 2.5) * 22) * 0.45 * (1 - faixa(t, 2.5, 3.8));
      sino(ctx, sx, by + bh / 2, bh * 0.5, balanco, '#0f0f0f');
    }
    ctx.restore();

    // Onda do clique
    for (const [tc, cx] of [[1.3, likeX + likeW * 0.5], [2.45, subX + subW * 0.5]]) {
      const k = faixa(t, tc, tc + 0.45);
      if (k > 0 && k < 1) {
        ctx.beginPath();
        ctx.arc(cx, by + bh / 2, bh * (0.2 + k * 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
        ctx.lineWidth = h * 0.02;
        ctx.stroke();
      }
    }

    // Cursor: entra, clica no curtir, vai pro inscrever, clica, sai
    const alvoL = [likeX + likeW * 0.5, by + bh * 0.55];
    const alvoS = [subX + subW * 0.5, by + bh * 0.55];
    const fora = [w * 1.05, h * 1.2];
    let cx;
    let cy;
    if (t < 0.5) [cx, cy] = fora;
    else if (t < 1.2) {
      const k = suave(faixa(t, 0.5, 1.2));
      cx = fora[0] + (alvoL[0] - fora[0]) * k;
      cy = fora[1] + (alvoL[1] - fora[1]) * k;
    } else if (t < 1.6) [cx, cy] = alvoL;
    else if (t < 2.35) {
      const k = suave(faixa(t, 1.6, 2.35));
      cx = alvoL[0] + (alvoS[0] - alvoL[0]) * k;
      cy = alvoL[1] + (alvoS[1] - alvoL[1]) * k;
    } else if (t < 3.6) [cx, cy] = alvoS;
    else {
      const k = suave(faixa(t, 3.6, 4.3));
      cx = alvoS[0] + (fora[0] - alvoS[0]) * k;
      cy = alvoS[1] + (fora[1] - alvoS[1]) * k;
    }
    const apertado = (t >= 1.22 && t < 1.38) || (t >= 2.37 && t < 2.53);
    cursor(ctx, cx, cy, h * 0.28, apertado);

    ctx.restore();
  }

  /** Gera os quadros PNG da animação (24 por segundo) para o vídeo. */
  async function gerarQuadros(idioma, largura = 900, fps = 24) {
    await document.fonts.load('700 40px Inter').catch(() => {});
    const w = largura;
    const h = Math.round(largura / 3);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const quadros = [];
    const total = DUR * fps;
    for (let i = 0; i < total; i++) {
      g.clearRect(0, 0, w, h);
      desenhar(g, 0, 0, w, h, i / fps, idioma);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      quadros.push(new Uint8Array(await blob.arrayBuffer()));
    }
    return quadros;
  }

  window.BotaoInscrever = { DUR, desenhar, gerarQuadros };
})();
