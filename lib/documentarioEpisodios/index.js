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

// O Egito completo (~1h40) vem logo depois do teste dos vikings.
// ep04 (noite no Egito) e ep09 (pirâmides) viraram capítulos dele e não entram mais sozinhos.
export const EPISODIOS = [vikings, egitoCompleto, castelo, caravelas, gauchos, pompeia, monges, imigrantes, inuites];
