// Módulo puro das decisões do release no gitflow.
//
// Nenhuma função aqui toca em disco, rede ou git: recebem fatos já lidos e devolvem decisões.
// É o `release.mjs` quem lê o estado (branch, PR, tag, release) e executa os passos.

// Nomes das branches do fluxo: as duas permanentes e os prefixos de hotfix e release.
export const BRANCHES = { develop: 'develop', main: 'main', hotfix: 'hotfix/', release: 'release/' };

// De onde o release pode sair: 'develop' (versão nova), 'hotfix' (correção) ou null (recusa).
export function releaseSource(branch) {
  if (typeof branch !== 'string') {
    return null;
  }
  if (branch === BRANCHES.develop) {
    return 'develop';
  }
  if (branch.startsWith(BRANCHES.hotfix) && branch.length > BRANCHES.hotfix.length) {
    return 'hotfix';
  }
  return null;
}

// Mensagem de recusa (RF22) quando o release roda fora da develop e de uma hotfix/.
export function wrongBranchMessage(branch) {
  return `Rode o release na develop (versão nova) ou numa branch hotfix/... (correção). Você está em "${branch}".`;
}

// Quais passos do `finish` ainda faltam, a partir dos fatos lidos: cada um só roda se o estado
// ainda não o reflete, para o `finish` poder ser repetido depois de uma falha no meio.
export function finishPlan({ prState, tagOnOrigin, releaseExists, mainInDevelop, headExistsLocal, headExistsRemote }) {
  return {
    mergePr: prState !== 'MERGED',
    tag: !tagOnOrigin,
    release: !releaseExists,
    backMerge: !mainInDevelop,
    deleteLocal: Boolean(headExistsLocal),
    deleteRemote: Boolean(headExistsRemote),
  };
}
