import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="display text-sm font-bold uppercase tracking-widest mb-1">{title}</h3>
      <div className="space-y-1.5 text-[13px] leading-snug">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

export function RulesContent() {
  return (
    <div>
      <Section title="Goal">
        <p>
          Be the first lord to reach <b>10 victory points (VP)</b> on your own turn. The game ends the moment you get there.
        </p>
        <Bullets items={[
          <>Settlement: <b>1 VP</b> · City: <b>2 VP</b></>,
          <>Longest Trail: <b>2 VP</b> · Largest Host: <b>2 VP</b></>,
          <>Royal Seal cards: <b>1 VP</b> each, kept hidden until they win you the game</>,
        ]} />
      </Section>

      <Section title="The island">
        <Bullets items={[
          <>Forest → <b>Lumber</b>, Hills → <b>Clay</b>, Fields → <b>Grain</b>, Pasture → <b>Wool</b>, Mountains → <b>Ore</b>. The desert produces nothing and is where the robber starts.</>,
          <>Each hex has a number token. When that number is rolled, every settlement touching the hex collects 1 card (a city collects 2). <b>6 and 8</b> come up most often; 2 and 12 are rare.</>,
          <>Harbors sit on the coast. A settlement or city on a harbor corner gives better bank trades (see Trading).</>,
        ]} />
      </Section>

      <Section title="Setup">
        <p>
          Each lord places <b>2 settlements and 2 roads</b>, in snake order (first to last, then last to first). Your <b>second</b> settlement gives you 1 card from each hex it touches.
        </p>
        <p><b>Distance rule:</b> a settlement can never be built next to another settlement or city, even an opponent's.</p>
      </Section>

      <Section title="Your turn">
        <Bullets items={[
          <><b>1. Roll</b> the dice. Everyone collects cards from hexes matching the total.</>,
          <><b>2. Trade and build</b> in any order, as often as you can pay.</>,
          <><b>3. End turn</b> to pass play to the next lord.</>,
        ]} />
        <p>To build, choose the action, click one of the highlighted spots on the board, then confirm.</p>
        <p>You may play one development card per turn, even before rolling.</p>
      </Section>

      <Section title="Building costs">
        <Bullets items={[
          <><b>Road:</b> 1 Lumber + 1 Clay (must connect to your roads or buildings)</>,
          <><b>Settlement:</b> 1 Lumber + 1 Clay + 1 Grain + 1 Wool (must connect to one of your roads)</>,
          <><b>City:</b> 3 Ore + 2 Grain (replaces one of your settlements)</>,
          <><b>Development card:</b> 1 Ore + 1 Grain + 1 Wool</>,
        ]} />
        <p>Piece limits: 15 roads, 5 settlements, 4 cities each.</p>
      </Section>

      <Section title="The bank">
        <p>
          The bank holds <b>19 of each resource</b> (shown in the top bar). Built and traded cards go back to it. If the bank can't pay everyone on a roll, nobody who is owed that resource collects it, unless only one lord is owed it, in which case they get what's left.
        </p>
      </Section>

      <Section title="Rolling a 7: the robber">
        <Bullets items={[
          <>Every lord holding <b>more than 7 cards</b> discards half of them (rounded down).</>,
          <>The roller moves the robber to a different hex. That hex produces nothing while the robber is there.</>,
          <>The roller then steals 1 random card from a lord who has a building on that hex.</>,
        ]} />
      </Section>

      <Section title="Trading">
        <Bullets items={[
          <><b>Bank:</b> 4 of one resource for 1 of another.</>,
          <><b>3:1 harbor:</b> 3 of any one resource for 1. Owning a settlement or city on its corner unlocks it.</>,
          <><b>2:1 harbor:</b> 2 of that harbor's resource for 1 of anything.</>,
          <><b>Players:</b> use <b>Trade Players</b> on your turn. Pick a rival (or anyone), choose what you give and want, and propose. A rival can accept, decline, or answer with a counteroffer.</>,
          <>Rivals may offer you swaps on their turns. You can <b>Accept</b>, <b>Decline</b> or <b>Counter</b>. The rival lords also trade with each other.</>,
        ]} />
        <p>Rivals won't help a lord who is close to winning, and they only accept deals that suit them.</p>
      </Section>

      <Section title="Development cards">
        <p>A new card can't be played on the turn you buy it (Royal Seals never need to be played). Your cards sit in the tray at the top left. Press <b>Play</b> when a card is ready; the tray tells you why a card can't be played yet.</p>
        <Bullets items={[
          <><b>Knight</b> (14): move the robber and steal 1 card. Counts toward Largest Host.</>,
          <><b>Royal Seal</b> (5): worth 1 VP.</>,
          <><b>Surveyors</b> (2): build 2 roads for free.</>,
          <><b>Bounty</b> (2): take any 2 resources from the bank.</>,
          <><b>Royal Decree</b> (2): name a resource; every rival gives you all of theirs.</>,
        ]} />
      </Section>

      <Section title="Bonus cards">
        <Bullets items={[
          <>
            <b>Longest Trail (2 VP):</b> a continuous road of <b>5 or more</b> that is strictly longer than everyone else's. A rival settlement built on your road cuts it. The holder keeps the card if still tied for longest. If it is cut and several other lords tie, the card is set aside until one lord is clearly longest.
          </>,
          <>
            <b>Largest Host (2 VP):</b> the first lord to play <b>3 Knights</b> takes it. Someone else needs strictly more Knights to steal it; ties keep it with the holder.
          </>,
        ]} />
      </Section>

      <Section title="Keyboard shortcuts">
        <Bullets items={[
          <><b>R</b> roll the dice · <b>E</b> end your turn</>,
          <><b>1</b> settlement · <b>2</b> city · <b>3</b> road · <b>4</b> buy a development card</>,
          <><b>B</b> trade with the bank · <b>T</b> trade with players</>,
          <><b>Enter</b> confirm a placement · <b>Esc</b> cancel it (or back out of a Knight or Surveyors card)</>,
        ]} />
        <p>Shortcuts pause while a window is open, and a build key does nothing when you can't afford it.</p>
      </Section>

      <Section title="Island, seating and tips">
        <Bullets items={[
          <><b>Classic</b> is the fixed island, <b>Random</b> a shuffled one, and <b>Random + fog</b> a shuffled island that stays hidden while everyone places their first two settlements (the AI places blind too). It appears once setup is over.</>,
          <><b>Random seating</b> shuffles who plays first. Turn order and colors follow the new order.</>,
          <>If the game is waiting for you while you are in another tab, the tab title flashes and a soft chime plays. Switch this and the tutorial tips off or on in the <b>Display</b> menu.</>,
        ]} />
      </Section>

      <Section title="Online play">
        <Bullets items={[
          <>On the main menu press <b>Play online with friends</b>. Create a room and send the invite link, or type a friend's 5-letter room code to join.</>,
          <>Two to four players; the host can add AI players and picks the island. Everyone sees only their own cards.</>,
          <>If you lose your connection the game reconnects by itself, and opening the page again puts you back in your seat.</>,
        ]} />
      </Section>

      <Section title="Pass and play (2 to 4 people on one screen)">
        <Bullets items={[
          <>Choose how many people are playing in the lobby. You can mix people and AI rivals, up to four players in total.</>,
          <>When the turn passes to another person, a cover screen asks you to hand over the device. Press its button when the right person is holding it. Until then every hand is hidden.</>,
          <>The cover also appears when someone must <b>discard</b> after a 7 or has a <b>trade offer</b> to answer. Trade with another person through <b>Trade Players</b>: they accept, decline or counter after the device is passed over.</>,
          <>Points from Royal Seals stay hidden on the cards and on the score bars until the game ends.</>,
        ]} />
      </Section>

      <Section title="Phone and tablet">
        <Bullets items={[
          <><b>Drag</b> the board with one finger to move it, <b>pinch</b> with two to zoom, and <b>double-tap</b> an empty spot to reset the view.</>,
          <>The <b>Players</b> and <b>Log</b> buttons at the top right of the board open a panel with every player's cards and the Chronicle.</>,
        ]} />
      </Section>

      <Section title="Tips">
        <Bullets items={[
          <>Start on a spot that touches several different resources and good numbers (6, 8, 5, 9).</>,
          <>Grab a harbor for a resource you produce a lot of.</>,
          <>The dots under each resource in your hand show how many of the 36 dice outcomes pay you that resource each roll. More dots means steadier income, and "no income" means you must trade for it.</>,
          <>Hoarding is risky: more than 7 cards means you lose half to a 7.</>,
          <>When someone wins, a summary shows the final standings, a points-over-time chart, the dice histogram, cards collected and the turning points. Close it with <b>View board</b> to study the final map.</>,
          <>Trades help both sides, so keep an eye on who is getting close to 10 VP.</>,
          <>The <b>Display</b> button (top right) turns on high contrast, writes the resource name on every hex, and switches the player symbols on or off. Each player's pieces carry their own shape (circle, square, triangle, diamond) as well as a color.</>,
        ]} />
      </Section>
    </div>
  );
}

/** A toggle button that shows or hides the rules panel. Press it again (or the X, or Esc) to hide. */
export function RulesButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant={open ? "default" : "secondary"}
        size="sm"
        aria-expanded={open}
        aria-controls="rules-panel"
        aria-label={open ? "Hide rules" : "Show rules"}
        onClick={() => setOpen((o) => !o)}
        className="gap-1.5"
      >
        <BookOpen size={14} />
        <span className="hidden sm:inline">{open ? "Hide Rules" : "Rules"}</span>
      </Button>

      {open && (
        <aside
          id="rules-panel"
          role="region"
          aria-label="Game rules"
          className="parchment fixed right-3 top-14 z-40 flex max-h-[calc(100vh-4.5rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col rounded-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-black/15 px-4 py-2.5">
            <h2 className="display text-base font-bold tracking-wider">How to Play</h2>
            <button
              type="button"
              aria-label="Hide rules"
              onClick={() => setOpen(false)}
              className="rounded p-1 opacity-70 hover:bg-black/10 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3">
            <RulesContent />
          </div>
        </aside>
      )}
    </>
  );
}
