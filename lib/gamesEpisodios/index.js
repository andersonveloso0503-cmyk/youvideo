// Episódios prontos do canal de games "Próxima Fase" (lançamentos, notícias e listas).
// Mesmo formato dos documentários (lib/documentario.js), com a cena "@ jogo: Nome do jogo"
// para imagens e trailers oficiais (lib/games.js). A ordem aqui é a ordem em que entram na Fábrica.
// Para um episódio novo: copie um arquivo, troque o texto e acrescente no fim da lista.
import gta6Tudo from './ep01-gta6-tudo';
import parecidosGta from './ep02-parecidos-gta';
import gratisSteam from './ep03-gratis-steam';

export const GAMES = [gta6Tudo, parecidosGta, gratisSteam];
