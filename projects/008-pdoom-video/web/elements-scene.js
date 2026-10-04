// Draw the inventory and controller with the existing upstream functions.
(() => {
  let selection = 'clawd', controller = null;
  const ids = new Set(ElementCatalog.map(item => item.id));
  function drawCharacter(c, t) {
    const u = c.size, m = move(c.motion, t, 0), o = { ...m, eyes: c.eyes, aR: c.arm * Math.PI / 180 };
    if (c.actor === 'clawd') clawd(c.x + m.dx * u, 830, u, { ...o, hat: c.accessory || undefined, col: c.color, dk: mixCol(c.color, PAL.ink, .35), lt: mixCol(c.color, PAL.cream, .4) });
    // Researcher expresses horizontal spin as a phase rather than Clawd's sx.
    else researcher(c.x + m.dx * u * .75, 830, u * .75, { ...o, spin: Math.acos(m.sx) / (2 * Math.PI), run: c.motion === 'run' ? m.walk : undefined, coat: c.color, bowtie: c.accessory === 'bowtie' });
  }
  window.drawWorld = t => {
    if (controller) drawCharacter(controller, t);
    else switch (selection) {
      case 'clawd': clawd(960, 840, 60, { eyes: 'happy', aR: .8 }); break;
      case 'researcher': researcher(960, 870, 40, { eyes: 'wide', aR: .8 }); break;
      case 'troupe': dancer(620, 860, 38, 'wave', t, {hat:'hard'}); dancer(1000, 860, 38, 'hop', t, {hat:'crown'}); dancer(1380, 860, 38, 'sway', t, {hat:'party'}); break;
      case 'sydney': CAST.sydney(960, 860, 48, t, {aR:1.1}); break;
      case 'gato': CAST.gato(1080, 860, 48, t, {eyes:'happy',perk:.5}); break;
      case 'shoggoth': CAST.shoggoth(960, 900, 46, t, {mask:.25}); break;
      case 'basilisk': CAST.basilisk(1050, 930, 30, t, {open:.3,eyes:'wide'}); break;
      case 'chinchilla': CAST.chinchilla(960, 940, 52, t, {cheeks:.6,paws:.5,chew:.7}); break;
      case 'stage': stageBack(t,{spots:[[960,PAL.cream]]}); stageFront(t,{curtain:.18}); break;
      case 'meter': meterProp(960,930,1.2,64,{label:'P(DOOM)',glow:.5}); break;
      case 'pump': pumpProp(840,870,1.8,pumpH(t),[1260,710]); break;
      case 'spotlight': paint(rectPts(-100,-100,2120,1280),{wash:PAL.indigo,ink:null}); spotlight(960,PAL.ochre); break;
      case 'sunburst': sunburst(960,540,PAL.rose,PAL.ochre,t*.12); break;
      case 'geometry': paint(rectPts(380,270,300,220,2),{wash:PAL.teal,fill:PAL.sap});paint(ellPts(1410,380,180,130,24,2),{fill:PAL.violet});paint(starPts(960,350,130),{wash:PAL.ochre});paint(heartPts(960,740,85),{fill:PAL.rose});break;
    }
    // Same final flush used by the original timeline, including deferred brush layers.
    letter(controller ? 'PARAMETERS → POSE → PAINT' : ElementCatalog.find(item=>item.id===selection).name,960,1010,28,PAL.ink,{font:'600 28px sans-serif',ink:false});
    flushLetters();
  };
  const render = async t => {
    const start=performance.now();brush.seed(1000+Math.floor(t*12));brush.noiseSeed(77);
    const url=await window.renderAt(t,'image/jpeg',.88);
    return {url,renderMs:performance.now()-start,time:t,selection,controller,pose:controller?move(controller.motion,t,0):null};
  };
  window.renderElement = async id => {
    if (!ids.has(id)) throw new Error('Unknown element');
    selection=id;controller=null;return render(1.8);
  };
  window.driveElement = async input => {
    const allowedActor=['clawd','researcher'],allowedMove=['idle','wave','walk','run','hop','sway','spin','roof','bounce','stomp','shimmy','mix'];
    const clawdEyes=['normal','happy','scared','heart','wink','angry'],researcherEyes=['dot','wide','star','heart','closed','sad'];
    const accessories=input.actor==='clawd'?['','hard','crown','party','cat']:['','bowtie'];
    if(!allowedActor.includes(input.actor)||!allowedMove.includes(input.motion)||!(input.actor==='clawd'?clawdEyes:researcherEyes).includes(input.eyes)||!accessories.includes(input.accessory)||!/^#[0-9a-f]{6}$/i.test(input.color))throw new Error('Invalid controller parameters');
    for(const [key,min,max] of [['size',24,60],['x',350,1550],['arm',-80,100],['time',0,4]])if(!Number.isFinite(input[key])||input[key]<min||input[key]>max)throw new Error('Controller parameter out of range');
    controller={...input};selection=input.actor;return render(input.time);
  };
  window.elementSceneReady=true;
})();
