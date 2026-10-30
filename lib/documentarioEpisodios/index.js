// Episódios prontos do canal "Noites na História" (documentários para dormir).
// A ordem aqui é a ordem em que entram na Fábrica (1 por dia). Para um episódio novo:
// crie o arquivo no mesmo formato (veja lib/documentario.js) e acrescente no fim da lista.
import vikings from './ep01-vikings';
import castelo from './ep02-castelo';
import caravelas from './ep03-caravelas';
import gauchos from './ep05-gauchos';
import pompeia from './ep06-pompeia';
import monges from './ep07-monges';
import imigrantes from './ep08-imigrantes';
import inuites from './ep10-inuites';
import egitoCompleto from './ep11-egito-completo';
import enchente1941 from './ep12-enchente-1941';
import cesio137 from './ep13-cesio-137';
import krakatoa from './ep14-krakatoa';
import lagoNyos from './ep15-lago-nyos';
import joelma from './ep16-joelma';
import pompeia79 from './ep17-pompeia';
import ondaDeMelaco from './ep18-onda-de-melaco';
import armero from './ep19-armero';
import lisboa1755 from './ep20-lisboa-1755';
import tunguska from './ep21-tunguska';
import { GAMES } from '../gamesEpisodios';

// O Egito completo (~1h40) vem logo depois do teste dos vikings.
// ep04 (noite no Egito) e ep09 (pirâmides) viraram capítulos dele e não entram mais sozinhos.
// Out/2026: o canal mudou para catástrofes e cidades de antigamente (fotos reais + ilustrações).
// Só os episódios da nova fase entram na Fábrica; os "para dormir" antigos ficam guardados em ANTIGOS.
// Ordem de publicação: alterna Brasil e mundo
export const EPISODIOS = [enchente1941, cesio137, krakatoa, lagoNyos, joelma, pompeia79, ondaDeMelaco, armero, lisboa1755, tunguska];
export const ANTIGOS = [vikings, egitoCompleto, castelo, caravelas, gauchos, pompeia, monges, imigrantes, inuites];
// Para achar o episódio de um vídeo que já está na Fábrica (novo ou antigo)
// (inclui os do canal de games, que usam a mesma Fábrica)
export const TODOS_EPISODIOS = [...EPISODIOS, ...ANTIGOS, ...GAMES];
