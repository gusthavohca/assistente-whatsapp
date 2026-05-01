// ============================================================================
// RELATORIO.JS - Envia relatório semanal todo domingo às 18h
// ============================================================================

const { lerRelatorioSemana } = require('./firebase');
const zapi = require('./zapi');

const NUMERO_ADMIN = process.env.NUMERO_GUSTHAVO_PESSOAL;

async function enviarRelatorioSemanal() {
  try {
    console.log('📊 Gerando relatório semanal...');
    const relatorio = await lerRelatorioSemana();

    if (!relatorio) {
      console.log('⚠️ Não foi possível gerar o relatório.');
      return;
    }

    // Monta as perguntas mais frequentes
    const perguntas = Object.entries(relatorio.perguntas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => `  • "${p}" — ${n}x`)
      .join('\n');

    const mensagem = `Relatório semanal Le Club

Período: últimos 7 dias

Atendimentos: ${relatorio.atendimentos}
Pedidos de lista: ${relatorio.lista}
Pedidos de camarote: ${relatorio.camarote}
Pedidos de aniversário: ${relatorio.aniversario}

Perguntas mais frequentes:
${perguntas || '  Nenhuma registrada ainda'}`;

    await zapi.enviarTexto(NUMERO_ADMIN, mensagem);
    console.log('✅ Relatório enviado!');
  } catch (erro) {
    console.log('❌ Erro ao enviar relatório:', erro.message);
  }
}

function iniciarAgendamento() {
  console.log('📅 Agendamento de relatório ativado (domingos às 18h)');

  setInterval(() => {
    const agora = new Date();
    const diaDaSemana = agora.getDay(); // 0 = domingo
    const hora = agora.getHours();
    const minuto = agora.getMinutes();

    if (diaDaSemana === 0 && hora === 18 && minuto === 0) {
      enviarRelatorioSemanal();
    }
  }, 60000); // verifica a cada 1 minuto
}

module.exports = { iniciarAgendamento, enviarRelatorioSemanal };