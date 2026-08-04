# ============================================================================
# deploy-cbp.ps1 - Deploy seguro do CBP (Chico Bento Promoter)
# ============================================================================
# Criado em 04/08/2026 depois de um incidente real: o repositorio local ficou
# sem remoto configurado e sem ninguem perceber, quase causando a perda do
# rastro do historico do projeto no GitHub. Este script existe pra nunca mais
# acontecer - ele CHECA o estado do repositorio antes de deixar voce enviar
# qualquer coisa, e aborta (em vez de arriscar) se algo estiver fora do normal.
#
# Como usar: sempre que terminar uma mudanca no 01-cbp e quiser publicar,
# rode este script em vez dos comandos git manuais.
# ============================================================================

$ErrorActionPreference = "Stop"

$origem  = "C:\Users\gusth\Claude\Projects\Eco sistema de trabalho\01-cbp"
$destino = "C:\Users\gusth\Claude\Projects\CBP"

function Abortar($motivo) {
    Write-Host ""
    Write-Host "ABORTADO: $motivo" -ForegroundColor Red
    Write-Host "Nada foi enviado. Resolva o problema acima antes de tentar de novo." -ForegroundColor Red
    exit 1
}

Write-Host "== 1/7 Indo para a pasta do repositorio ==" -ForegroundColor Cyan
if (-not (Test-Path $destino)) { Abortar("Pasta nao encontrada: $destino") }
Set-Location $destino

Write-Host "== 2/7 Checando travas antigas ==" -ForegroundColor Cyan
if (Test-Path .git\config.lock) {
    Write-Host "  Encontrado .git\config.lock (sobra de execucao anterior) - removendo." -ForegroundColor Yellow
    Remove-Item .git\config.lock -Force
}

Write-Host "== 3/7 Checando remoto configurado ==" -ForegroundColor Cyan
$remoto = git remote -v 2>$null
if (-not $remoto) {
    Abortar("Nenhum remoto origin configurado neste repositorio. Isso e exatamente o que causou o incidente de 04/08. NAO prossiga sem resolver isso primeiro - fale com o Claude antes de continuar.")
}

Write-Host "== 4/7 Checando branch atual ==" -ForegroundColor Cyan
$branchAtual = git rev-parse --abbrev-ref HEAD 2>$null
if ($branchAtual -ne "main") {
    Abortar("Voce esta no branch $branchAtual, nao no main. Troque para o main (git checkout main) antes de rodar este script.")
}

Write-Host "== 5/7 Comparando com o GitHub (fetch) ==" -ForegroundColor Cyan
git fetch origin
$local  = git rev-parse HEAD
$remoto2 = git rev-parse origin/main 2>$null
if (-not $remoto2) {
    Abortar("Nao consegui ler origin/main. Confira sua conexao ou se o repositorio remoto ainda existe.")
}
if ($local -ne $remoto2) {
    Write-Host "  Seu branch local NAO esta sincronizado com o GitHub." -ForegroundColor Yellow
    Write-Host "  Local:  $local"
    Write-Host "  Remoto: $remoto2"
    $resp = Read-Host "  Rodar git pull origin main agora para sincronizar? (s/n)"
    if ($resp -eq "s") {
        git pull origin main
    } else {
        Abortar("Repositorio desincronizado e voce optou por nao sincronizar. Resolva manualmente ou fale com o Claude.")
    }
}

Write-Host "== 6/7 Copiando arquivos atualizados de 01-cbp ==" -ForegroundColor Cyan
if (-not (Test-Path $origem)) { Abortar("Pasta de origem nao encontrada: $origem") }
Copy-Item -Path "$origem\src\*"    -Destination "src\"    -Recurse -Force
Copy-Item -Path "$origem\painel\*" -Destination "painel\" -Recurse -Force

git add -A
$statusResumo = git status --short
if (-not $statusResumo) {
    Write-Host ""
    Write-Host "Nada mudou desde o ultimo deploy. Nada a enviar." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "== O que vai ser enviado: ==" -ForegroundColor Cyan
git status
Write-Host ""
$confirmar = Read-Host "Revise a lista acima com atencao. Esta tudo certo? Digite sim para continuar"
if ($confirmar -ne "sim") {
    git reset | Out-Null
    Write-Host "Deploy cancelado. Nada foi commitado nem enviado." -ForegroundColor Yellow
    exit 0
}

Write-Host "== 7/7 Commit e push ==" -ForegroundColor Cyan
$mensagem = Read-Host "Mensagem do commit (descreva o que mudou)"
if (-not $mensagem) { $mensagem = "Deploy via deploy-cbp.ps1" }
git commit -m "$mensagem"
git push origin main

Write-Host ""
Write-Host "Deploy enviado com sucesso!" -ForegroundColor Green
Write-Host "O Railway atualiza sozinho em 1-2 minutos. Confira em:" -ForegroundColor Green
Write-Host "https://railway.com -> projeto assistente-whatsapp -> aba Deployments"
