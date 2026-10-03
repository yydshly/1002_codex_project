export function initShowcase(root) {
  const $=selector=>root.querySelector(selector), all=selector=>[...root.querySelectorAll(selector)];
  let engine, pending, active=false, nearby, camera='third', audio, audioGain, sounding=false, wasTouring=false;
  const names={third:'第三人称',first:'第一人称',overview:'花园全景'};
  const status=message=>{$('#park-status').textContent=message;};
  function setReady(ready){all('button,select').forEach(control=>{if(control.id!=='park-retry'&&control.id!=='park-interact')control.disabled=!ready;});}
  setReady(false);
  function showArtifact(exhibit) {
    $('#park-art-number').textContent=`EXHIBIT ${exhibit.number}`;$('#park-art-title').textContent=exhibit.title;
    $('#park-art-author').textContent=exhibit.author;$('#park-art-description').textContent=exhibit.description;
    $('#park-art-capability').textContent=exhibit.capability;$('#park-art-panel').hidden=false;
    all('[data-park-stop]').forEach(b=>b.classList.toggle('selected',b.dataset.parkStop===exhibit.id));
  }
  async function ensure() {
    if(pending)return pending;
    pending=(async()=>{
      try {
        const {createPark}=await import('./park-scene.js');
        engine=await createPark($('#park-canvas'),{
          onProgress(message){$('#park-loading-message').textContent=message;},
          onArtifact:showArtifact,
          onStats(s){$('#park-fps').textContent=`${s.fps} FPS`;$('#park-map-player').setAttribute('cx',String(60+s.position.x*.74));$('#park-map-player').setAttribute('cy',String(66+s.position.z*.74));$('#park-position').textContent=`${s.position.x.toFixed(1)} / ${s.position.z.toFixed(1)}`;},
          onCamera(mode){camera=mode;$('#park-camera').textContent=`${names[mode]} · V`;$('.park-frame').classList.toggle('park-walking',mode!=='overview');},
          onLocation(info){nearby=info.nearby;if(!nearby&&info.tour||wasTouring&&!info.tour)$('#park-art-panel').hidden=true;if(wasTouring&&!info.tour)status('导览已结束，可以继续自由探索。');wasTouring=info.tour;$('#park-location').textContent=info.title;$('#park-interact').textContent=nearby?`查看「${nearby.title}」 · E`:'走近作品，查看展览';$('#park-interact').disabled=!nearby;$('#park-tour').textContent=info.tour?'结束导览':'跟随导览';$('#park-tour').setAttribute('aria-pressed',String(info.tour));},
        });
        engine.setActive(active);setReady(true);$('#park-loading').hidden=true;status('场景已就绪。跟随导览，或点击画面后用 WASD 自由探索。');
      }catch(error){console.error('Art garden initialization failed',error);$('#park-loading-message').textContent='场景加载未完成，请检查本地资源与浏览器硬件加速。';$('#park-loading').classList.add('error');$('#park-retry').hidden=false;status('场景初始化失败，可重试。');}
    })();return pending;
  }
  $('#park-camera').addEventListener('click',()=>{engine?.setCamera({third:'first',first:'overview',overview:'third'}[camera]);$('#park-canvas').focus({preventScroll:true});});
  $('#park-tour').addEventListener('click',()=>{const touring=engine?.startTour();$('#park-art-panel').hidden=true;status(touring?'Lumo 正在沿展览路线行走。使用方向键可随时接管。':'导览已停止，可自由漫游。');$('#park-canvas').focus({preventScroll:true});});
  $('#park-wave').addEventListener('click',()=>{engine?.wave();status('Lumo 向你挥手。');$('#park-canvas').focus({preventScroll:true});});
  $('#park-interact').addEventListener('click',()=>engine?.interact());
  $('#park-art-close').addEventListener('click',()=>{$('#park-art-panel').hidden=true;$('#park-canvas').focus({preventScroll:true});});
  $('#park-reset').addEventListener('click',()=>{engine?.reset();$('#park-art-panel').hidden=true;status('已回到花园入口。');});
  $('#park-retry').addEventListener('click',()=>location.reload());
  all('[data-park-light]').forEach(b=>b.addEventListener('click',()=>{engine?.setLight(b.dataset.parkLight);all('[data-park-light]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));status(`已切换到${b.textContent}。`);}));
  $('#park-quality').addEventListener('change',event=>engine?.setQuality(event.target.value));
  all('[data-park-stop]').forEach(b=>b.addEventListener('click',()=>{engine?.visit(b.dataset.parkStop);status(`已定位到${b.dataset.parkTitle}，可以在周围继续行走。`);}));
  all('[data-park-move]').forEach(b=>{const release=()=>{engine?.setMovement(b.dataset.parkMove,false);b.classList.remove('pressed');};b.addEventListener('pointerdown',event=>{event.preventDefault();b.setPointerCapture(event.pointerId);engine?.setMovement(b.dataset.parkMove,true);b.classList.add('pressed');});['pointerup','pointercancel','lostpointercapture'].forEach(e=>b.addEventListener(e,release));});
  const frame=$('.park-frame');
  async function exitFullscreen(){frame.classList.remove('park-immersive');document.body.classList.remove('park-immersive-page');if(document.fullscreenElement)await document.exitFullscreen();if(active)status('已返回展览页面，可继续参观。');}
  function escapeFullscreen(event){if(event.key==='Escape'&&frame.classList.contains('park-immersive'))exitFullscreen();}
  window.addEventListener('keydown',escapeFullscreen);
  $('#park-fullscreen').addEventListener('click',()=>{frame.classList.add('park-immersive');document.body.classList.add('park-immersive-page');status('已进入浏览器内全屏。点击「退出全屏」或按 Esc 返回。');});
  $('#park-exit-fullscreen').addEventListener('click',exitFullscreen);
  $('#park-sound').addEventListener('click',async()=>{
    if(!audio){audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.55;const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;const wind=audio.createGain();wind.gain.value=.045;audioGain=audio.createGain();audioGain.gain.value=0;source.connect(filter).connect(wind).connect(audioGain).connect(audio.destination);source.start();const lfo=audio.createOscillator(),mod=audio.createGain();lfo.frequency.value=.14;mod.gain.value=.015;lfo.connect(mod).connect(wind.gain);lfo.start();}
    await audio.resume();sounding=!sounding;audioGain.gain.setTargetAtTime(sounding?1:0,audio.currentTime,.5);$('#park-sound').textContent=sounding?'海风 · 开':'海风 · 关';$('#park-sound').setAttribute('aria-pressed',String(sounding));
  });
  return {
    async preview(kind){
      await ensure();if(!engine)return false;
      if(wasTouring)engine.startTour();
      engine.visit('tide');engine.setCamera('third');$('#park-art-panel').hidden=true;
      const light=kind==='material'?'blue':'golden';engine.setLight(light);all('[data-park-light]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.parkLight===light)));
      if(kind==='tour'){engine.startTour();status('Lumo 正在沿展览路线行走，方向输入可接管。');}
      else if(kind==='character'){engine.wave();status('观察骨骼挥手动作；点击画面用 WASD 行走，V 切换镜头。');}
      else status('观察金属、玻璃、水面反射与夜间灯具；可以继续切换光照与画质。');
      return true;
    },
    async setActive(value){active=Boolean(value);if(active){await ensure();engine?.setActive(active);if(active&&sounding)audio?.resume();}else{engine?.setActive(false);if(audio)audio.suspend();if(frame.classList.contains('park-immersive'))exitFullscreen();}},
    destroy(){active=false;engine?.destroy();audio?.close();window.removeEventListener('keydown',escapeFullscreen);frame.classList.remove('park-immersive');document.body.classList.remove('park-immersive-page');},
  };
}
