const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const players = [
    ['player-demo', 'Gracz Demo', 860, 1460],
    ['player-maja', 'Maja', 0, 0],
    ['player-kuba', 'Kuba', 0, 0],
    ['player-ola', 'Ola', 0, 0],
  ];
  for (const [id, nickname, pointsBalance, totalPointsEarned] of players) {
    await prisma.player.upsert({
      where: { id },
      update: { nickname, pointsBalance, totalPointsEarned },
      create: { id, nickname, pointsBalance, totalPointsEarned },
    });
  }

  const initiatives = [
    {
      id: 'tea', initiatorId: 'player-maja', latitude: 50.06798, longitude: 19.99154,
      votesCount: 9, threshold: 10, status: 'collecting',
      title: 'Stoisko z gorącą herbatą na HackYeah 2026',
      shortTitle: 'Gorąca herbata na HackYeah', category: 'Społeczeństwo',
      problem: 'Uczestnicy wydarzenia spędzają wiele godzin na miejscu i brakuje prostego, bezpłatnego punktu z ciepłym napojem.',
      proposedAction: 'Uruchomić małe stoisko z gorącą herbatą przy TAURON Arenie podczas HackYeah 2026.',
      whyImportant: 'To prosta inicjatywa, która poprawia komfort uczestników i tworzy naturalny punkt spotkań.',
      resourcesPeople: '2 osoby na zmianę', resourcesEquipment: 'termosy, kubki, stół',
      resourcesTransport: 'dowóz termosów i wody', fixer: 'Gracze',
      place: 'TAURON Arena Kraków, ul. Stanisława Lema 7'
    },
    {
      id: 'rack', initiatorId: 'player-kuba', latitude: 50.06662, longitude: 19.98872,
      votesCount: 6, threshold: 10, status: 'collecting',
      title: 'Stojak rowerowy przy wejściu do Parku Lotników', shortTitle: 'Stojak rowerowy przy parku',
      category: 'Rowery', problem: 'Przy wejściu do parku brakuje miejsca, gdzie można bezpiecznie przypiąć rower.',
      proposedAction: 'Ustawić prosty stojak rowerowy przy głównym wejściu od strony al. Pokoju.',
      whyImportant: 'Ułatwi to mieszkańcom dojazd rowerem i ograniczy przypinanie rowerów do ogrodzeń.',
      resourcesPeople: 'ekipa montażowa', resourcesEquipment: 'stojak i kotwy',
      resourcesTransport: 'dostawa stojaka', fixer: 'Miasto',
      place: 'Park Lotników Polskich, wejście od al. Pokoju'
    },
    {
      id: 'bench', initiatorId: 'player-ola', latitude: 50.06912, longitude: 19.99425,
      votesCount: 10, threshold: 10, status: 'passed',
      title: 'Dodatkowa ławka przy alejce spacerowej', shortTitle: 'Ławka przy alejce',
      category: 'Infrastruktura', problem: 'Na dłuższym fragmencie alejki nie ma miejsca do odpoczynku.',
      proposedAction: 'Ustawić jedną ławkę przy najbardziej uczęszczanym fragmencie alejki.',
      whyImportant: 'Pomoże seniorom, rodzicom i osobom o ograniczonej mobilności.',
      resourcesPeople: '2 osoby montażowe', resourcesEquipment: 'ławka i mocowania',
      resourcesTransport: 'transport ławki', fixer: 'Miasto',
      place: 'Czyżyny, alejka spacerowa przy TAURON Arenie'
    }
  ];
  for (const item of initiatives) {
    await prisma.initiative.upsert({ where: { id: item.id }, update: item, create: item });
  }

  const rewards = [
    { id: 'coffee', title: 'Kawa dla aktywnych', description: 'Jedna kawa w lokalnej kawiarni.', points: 250, sponsor: 'Kawiarnia Sąsiedzka', icon: 'cafe' },
    { id: 'cinema', title: 'Bilet do kina', description: 'Wejściówka na wybrany seans.', points: 700, sponsor: 'Kino Podgórskie', icon: 'film' },
    { id: 'transport', title: '24h komunikacji', description: 'Demonstracyjna nagroda: dobowy bilet komunikacji.', points: 1000, sponsor: 'Rowerowy Zakątek', icon: 'bus' },
  ];
  for (const reward of rewards) {
    await prisma.reward.upsert({ where: { id: reward.id }, update: reward, create: reward });
  }
}

main().finally(() => prisma.$disconnect());
