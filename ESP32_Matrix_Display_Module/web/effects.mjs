// Pure 20×15 previews. IDs and formulas match MatrixEffects.cpp on the ESP32.
export const EFFECTS = [
  ['Rainbow flow','Spectrum','Horizontal rainbow flowing across the grid.'],
  ['Vertical spectrum','Spectrum','Bands of color rise vertically.'],
  ['Diagonal rainbow','Spectrum','Slanted rainbow stripes travel diagonally.'],
  ['Rainbow rings','Spectrum','Concentric rainbow circles radiate from the center.'],
  ['Spectrum spiral','Spectrum','A rotating rainbow spiral curls inward.'],
  ['Hue breathing','Spectrum','The entire matrix softly changes hue and brightness.'],
  ['Color waves','Spectrum','Two crossing color waves wash over the display.'],
  ['Plasma','Spectrum','Organic color blobs blend through a plasma field.'],
  ['Aurora curtain','Spectrum','Green and violet curtains ripple in a dark sky.'],
  ['Prism checker','Spectrum','Small checker tiles drift through different hues.'],
  ['Expanding rings','Geometry','Thin circular waves expand from the center.'],
  ['Ripple pool','Geometry','Three overlapping water ripples interfere.'],
  ['Radar sweep','Geometry','A rotating beam leaves a fading circular trail.'],
  ['Spinning cross','Geometry','Two light bars rotate around the center.'],
  ['Checker flip','Geometry','Alternating squares trade their brightness.'],
  ['Moving stripes','Geometry','Bright vertical stripes slide sideways.'],
  ['Diamond pulse','Geometry','Diamond outlines breathe outward.'],
  ['Square tunnel','Geometry','Nested rectangular frames travel inward.'],
  ['Warp grid','Geometry','A glowing grid bends in moving waves.'],
  ['Kaleidoscope','Geometry','Six mirrored wedges rotate in a colorful pattern.'],
  ['Rain drops','Nature','Falling drops leave short blue trails.'],
  ['Matrix rain','Nature','Green code rain falls at different column speeds.'],
  ['Snow drift','Nature','Small snowflakes drift sideways as they fall.'],
  ['Fire','Nature','Warm flames flicker and climb from the bottom.'],
  ['Ocean waves','Nature','Blue wave crests sweep across deep water.'],
  ['Candle flicker','Nature','A warm flame glows and trembles gently.'],
  ['Forest fireflies','Nature','Green and gold fireflies twinkle over a forest.'],
  ['Starfield','Nature','Cool stars twinkle independently on a dark sky.'],
  ['Comet shower','Nature','Multiple diagonal comets streak across the grid.'],
  ['Lightning','Nature','Occasional branching lightning lights the sky.'],
  ['Snake trail','Motion','A rainbow snake walks the whole serpentine path.'],
  ['Bouncing ball','Motion','A glowing ball bounces off all four edges.'],
  ['Orbiting moons','Motion','Three colored moons follow circular orbits.'],
  ['Pendulum','Motion','A bright pendulum swings with a glowing tether.'],
  ['Laser scanner','Motion','A vertical laser beam scans back and forth.'],
  ['Helix ribbons','Motion','Two sinusoidal ribbons weave around each other.'],
  ['Fireworks','Motion','Colorful bursts expand into scattered sparks.'],
  ['Fountain','Motion','Seven droplets arc up and fall like a fountain.'],
  ['Vortex trail','Motion','A spiral trail spins toward a glowing center.'],
  ['Shooting star','Motion','One bright shooting star crosses with a long tail.'],
  ['Heartbeat','Playful','A moving heartbeat trace draws across the grid.'],
  ['Equalizer','Playful','Colorful simulated music bars rise and fall.'],
  ['Pong demo','Playful','A bouncing ball plays between moving paddles.'],
  ['Confetti','Playful','Colorful confetti tiles flutter down.'],
  ['Smiley bounce','Playful','A happy pixel face bounces around the display.'],
  ['Walking person','Playful','A tiny walking figure steps across the ground.'],
  ['Birds and trees','Playful','Birds flap through a scrolling tree landscape.'],
  ['Rocket launch','Playful','A pixel rocket launches with a flickering exhaust.'],
  ['Falling blocks','Playful','Colored block shapes drop through four lanes.'],
  ['Solar system','Playful','Three planets orbit a bright central sun.'],
  ['Color breath','Ambient','Your chosen color slowly fades in and out.'],
  ['Soft gradient','Ambient','A gentle two-color gradient drifts diagonally.'],
  ['Lava lamp','Ambient','Soft luminous blobs float and merge.'],
  ['Nebula','Ambient','Subtle violet and blue clouds drift in space.'],
  ['Sparkle paint','Ambient','Sparse bright sparkles appear in your chosen color.'],
  ['Sunset','Ambient','A warm sky glows over purple rippling water.'],
  ['Ember glow','Ambient','Hot red embers rise slowly from the bottom.'],
  ['Rippling flag','Ambient','Three bright color bands wave like fabric.'],
  ['Binary scroll','Ambient','Rows of green zeroes and ones scroll sideways.'],
  ['Effect carousel','Ambient','Cycles through six contrasting effects every six seconds.'],
].map(([name, category, description], id) => Object.freeze({id, name, category, description}));

const W=20,H=15,TAU=Math.PI*2,PI=Math.PI;
const wrap=(a,b)=>((a%b)+b)%b;
const clamp=v=>Math.max(0,Math.min(1,v));
const noise=n=>(((Math.imul(n|0,1664525)+1013904223)>>>8)&65535)/65535;
const sq=v=>v*v;
const spot=(x,y,cx,cy,r)=>sq(x-cx)+sq(y-cy)<=r*r;
const tri=(t,range)=>range-Math.abs(wrap(t,range*2)-range);
const scale=(c,v)=>c.map(a=>Math.round(a*clamp(v)));
const hsv=(h,s,v)=>{
  h=wrap(h,1)*6; s=clamp(s); v=clamp(v);
  const i=Math.floor(h),f=h-i,p=v*(1-s),q=v*(1-f*s),r=v*(1-(1-f)*s);
  const a=[[v,r,p],[q,v,p],[p,v,r],[p,q,v],[r,p,v],[v,p,q]][i];
  return a.map(n=>Math.round(n*255));
};

function effectPixel(id,x,y,t,c) {
  const dx=x-9.5,dy=y-7,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx),n=noise(x+y*W);
  let v=0,h=0;
  switch(id) {
    case 0:return hsv(x/20+t*.12,1,1);
    case 1:return hsv(y/15-t*.1,.9,1);
    case 2:return hsv((x+y)/18-t*.15,1,1);
    case 3:return hsv(d/9-t*.14,1,1);
    case 4:return hsv(a/TAU+d*.07-t*.15,1,1);
    case 5:return hsv(t*.08,.8,.25+.75*(.5+.5*Math.sin(t*2)));
    case 6:return hsv(.5+.25*Math.sin(x*.3+t)+.25*Math.cos(y*.45-t),.9,.9);
    case 7:return hsv((Math.sin(x*.3+t)+Math.sin(y*.4-t)+Math.sin((x+y)*.2+t*.7))/6+t*.04,1,1);
    case 8:v=clamp(1-Math.abs(y-(5+3*Math.sin(x*.3+t)))/5);return hsv(.32+.25*Math.sin(x*.2+t*.4),.9,v*.85);
    case 9:return hsv((Math.floor(x/3)+Math.floor(y/3))/8+t*.1,.85,.35+.65*((Math.floor(x/3)+Math.floor(y/3)+Math.floor(t))%2));
    case 10:v=Math.pow(.5+.5*Math.cos(d*1.6-t*3),10);return scale(c,v);
    case 11:v=(Math.sin(Math.hypot(x-3,y-3)*1.3-t*3)+Math.sin(Math.hypot(x-16,y-4)*1.2-t*2.7)+Math.sin(Math.hypot(x-10,y-13)*1.4-t*3.2)+3)/6;return hsv(.5+v*.2,.8,v);
    case 12:v=d<7?Math.exp(-wrap(t-a,TAU)*2)*(.3+.7*d/7):0;return scale(c,v);
    case 13:v=Math.min(Math.abs(dx*Math.cos(t)+dy*Math.sin(t)),Math.abs(-dx*Math.sin(t)+dy*Math.cos(t)))<.7?1:0;return scale(c,v);
    case 14:v=((Math.floor(x/3)+Math.floor(y/3))%2)?(.5+.5*Math.sin(t*2)):(.5-.5*Math.sin(t*2));return scale(c,v);
    case 15:return scale(c,wrap(x-t*4,5)<2?1:.04);
    case 16:v=Math.pow(.5+.5*Math.cos((Math.abs(dx)+Math.abs(dy))*1.2-t*3),8);return hsv(t*.06+d*.03,.8,v);
    case 17:v=wrap(Math.max(Math.abs(dx)*.75,Math.abs(dy))-t*2,3)<.8?1:.02;return hsv(d*.06-t*.08,.85,v);
    case 18:v=Math.min(wrap(x+2*Math.sin(y*.4+t),5),wrap(y+1.5*Math.sin(x*.3-t),4))<.65?1:.02;return scale(c,v);
    case 19:h=Math.cos(a*6+t)+Math.sin(d*.7-t*2);return hsv(h*.2+t*.05,.9,.25+.75*(.5+.5*Math.cos(a*6-d+t)));
    case 20:v=wrap(wrap(t*6+noise(x)*15,15)-y,15);return v<3?scale(c,1-v/3):[0,0,0];
    case 21:v=wrap(wrap(t*(3+noise(x)*5)+noise(x+41)*15,15)-y,15);return v<6?hsv(.33,.9,1-v/6):[0,0,0];
    case 22:v=0;for(let i=0;i<18;i++)if(spot(x,y,wrap(noise(i)*20+Math.sin(t+i)*1.5,20),wrap(noise(i+50)*15+t*(1+noise(i+10)),15),.55))v=1;return scale([210,235,255],v);
    case 23:v=clamp((y/14)*1.2-noise(x+Math.floor(t*8)*21+Math.floor(y/2)*37)*.55+.18*Math.sin(x*.7+t*3));return hsv(.02+v*.12,1,v);
    case 24:v=.5+.5*Math.sin(y*.9+x*.35-t*2);return hsv(.55+.08*v,.9,.15+.65*v);
    case 25:v=clamp(1-Math.hypot(dx*.45,dy*.8+2)/6)*(.65+.25*noise(Math.floor(t*12)));return hsv(.075,.9,v);
    case 26:v=n>.88?Math.pow(.5+.5*Math.sin(t*(1+n)+n*50),7):.015;return hsv(.19+n*.17,.85,v);
    case 27:v=n>.91?.15+.85*Math.pow(.5+.5*Math.sin(t*(1+n)+n*70),3):0;return hsv(.58,.15,v);
    case 28:v=wrap(x+y*.6-t*5,10);return v<2?hsv(y*.03+t*.08,.45,1-v/2):[0,0,0];
    case 29:{const pulse=Math.floor(t*2)%7===0&&wrap(t*2,1)<.22;const bolt=9+Math.sin(y*1.9+Math.floor(t*2))*3;v=pulse&&(Math.abs(x-bolt)<.8||(y>7&&Math.abs(x-bolt-(y-7))<.8))?1:(pulse?.07:0);return scale([200,220,255],v);}
    case 30:{const index=y%2?y*20+19-x:y*20+x,head=wrap(t*7,300),age=wrap(head-index,300);return age<22?hsv(age*.04+t*.04,1,1-age/22):[0,0,0];}
    case 31:v=Math.exp(-(sq(x-tri(t*4,19))+sq(y-tri(t*3,14)))/2);return scale(c,v);
    case 32:for(let i=0;i<3;i++)if(spot(x,y,9.5+Math.cos(t+i*TAU/3)*(3+i*2),7+Math.sin(t+i*TAU/3)*(2+i*1.5),1))return hsv(i/3+t*.03,.85,1);return [0,0,0];
    case 33:{const angle=Math.sin(t*1.8)*.9,cx=9.5+Math.sin(angle)*6,cy=2+Math.cos(angle)*6;v=spot(x,y,cx,cy,1.2)?1:(y>=2&&y<=cy&&Math.abs(x-(9.5+(y-2)*Math.tan(angle)))<.5?.2:0);return scale(c,v);}
    case 34:v=Math.exp(-sq(x-tri(t*5,19))*1.2);return scale(c,v);
    case 35:v=Math.min(Math.abs(y-(7+4*Math.sin(x*.4-t*2))),Math.abs(y-(7-4*Math.sin(x*.4-t*2))));return v<1?hsv(y<7?t*.08:.5+t*.08,1,1-v):[0,0,0];
    case 36:{const phase=wrap(t,3),cx=3+noise(Math.floor(t/3))*13,cy=3+noise(Math.floor(t/3)+5)*7,dist=Math.hypot(x-cx,y-cy);v=Math.abs(dist-phase*3)<.8&&noise(Math.floor(Math.atan2(y-cy,x-cx)*12)+Math.floor(t/3)*73)>.35?clamp(1-phase/3):0;return hsv(Math.floor(t/3)*.17,1,v);}
    case 37:for(let i=0;i<7;i++){const phase=wrap(t+i*.14,1.7),cx=9.5+(i-3)*phase*1.9,cy=14-15*phase+9*phase*phase;if(spot(x,y,cx,cy,.7))return hsv(.48+i*.025,.8,1);}return [0,0,0];
    case 38:v=Math.pow(.5+.5*Math.cos(a*2+d*.8-t*3),9)*clamp(1-d/13);return hsv(a/TAU+t*.08,1,v);
    case 39:{const hx=wrap(t*5,30)-5,hy=4+Math.sin(t*.7)*3,age=hx-x;v=age>=0&&age<8&&Math.abs(y-(hy+age*.3))<.7?1-age/8:0;return scale([230,240,255],v);}
    case 40:{const p=wrap(x-t*4,20),yy=p<6?7:p<8?7-(p-6)*2:p<10?3+(p-8)*4:p<12?11-(p-10)*2:7;v=Math.abs(y-yy)<.65?1:0;return scale(c,v);}
    case 41:{const column=Math.floor(x/2),bar=2+Math.floor((.5+.5*Math.sin(t*2+column*.8))*11);return y>=15-bar&&x%2===0?hsv((14-y)/20,.95,1):[0,0,0];}
    case 42:{const bx=1+tri(t*5,17),by=tri(t*3,14);v=spot(x,y,bx,by,.7)||((x===0||x===19)&&Math.abs(y-(x===0?tri(t*2.3,11)+1.5:tri(t*2.7+4,11)+1.5))<2)?1:0;return scale(c,v);}
    case 43:{const tile=Math.floor(x/2)+Math.floor(y/2)*10,seed=Math.floor(t*.8);v=noise(tile+seed*71)>.73?1:0;return hsv(noise(tile+seed*17),.85,v);}
    case 44:{const cx=3+tri(t*2,13),cy=3+tri(t*1.6,8),xx=Math.round(x-cx),yy=Math.round(y-cy);v=Math.abs(Math.hypot(xx,yy)-3)<.5||(yy===-1&&Math.abs(xx)===1)||(yy===1&&Math.abs(xx)===2)||(yy===2&&Math.abs(xx)<2)?1:0;return scale([255,200,25],v);}
    case 45:{const cx=Math.floor(wrap(t*3,24))-2,xx=x-cx,pose=Math.floor(t*5)%2;v=(y===4&&Math.abs(xx)<=1)||(y>=5&&y<=9&&xx===0)||(y===7&&Math.abs(xx)<=2)||(y===10&&Math.abs(xx)===1)||(y===11&&(xx===(pose?2:-2)||xx===(pose?-1:1)))?1:0;return y===13?scale(c,.2):scale(c,v);}
    case 46:{let bird=false;for(let i=0;i<3;i++){const bx=wrap(t*3+i*7,26)-3,by=3+i*2+Math.sin(t+i);if(spot(x,y,bx,by,.6)||Math.abs(y-(by+(Math.floor(t*5)%2?1:-1)))<.5&&Math.abs(Math.abs(x-bx)-1)<.5)bird=true;}const treeX=wrap(x+t*2,7)-3,tree=Math.abs(treeX)<(y-8)*.45&&y>8&&y<13;return bird?[240,240,255]:tree?[20,125,55]:y>=13?[25,65,25]:[0,4,12];}
    case 47:{const ry=19-wrap(t*4,26),yy=y-ry;return yy>=0&&yy<=5&&Math.abs(x-9.5)<1.1?[220,225,245]:yy>5&&yy<9&&Math.abs(x-9.5)<1.6?hsv(.03,.95,.5+.5*noise(x+y*20+Math.floor(t*9))):yy>-1&&yy<1&&Math.abs(x-9.5)<.7?[255,70,70]:[0,0,0];}
    case 48:{const lane=Math.floor(x/5),head=wrap(t*(2+lane*.4)+lane*4,20)-4,yy=y-head,xx=x%5;v=yy>=0&&yy<3&&((yy<2&&xx>0&&xx<4)||(yy>=2&&xx===2))?1:0;return hsv(lane*.21,.95,v);}
    case 49:if(spot(x,y,9.5,7,1.3))return [255,190,35];for(let i=0;i<3;i++)if(spot(x,y,9.5+Math.cos(t/(i+1)+i)*(3+i*2.3),7+Math.sin(t/(i+1)+i)*(2+i*1.8),.8))return hsv(i*.28+.3,.8,1);return [0,0,3];
    case 50:return scale(c,.1+.9*(.5+.5*Math.sin(t*1.3)));
    case 51:v=.5+.5*Math.sin(x*.12+y*.1-t*.5);return c.map((value,i)=>Math.round(value*v+([255-c[0],255-c[1],255-c[2]][i])*(1-v)*.55));
    case 52:v=0;for(let i=0;i<3;i++)v+=Math.exp(-(sq(x-(9.5+Math.sin(t*.6+i*2)*6))+sq(y-(7+Math.cos(t*.4+i*2)*4)))/14);return hsv(.02+.12*clamp(v),.9,clamp(v)*.9);
    case 53:v=(Math.sin(x*.2+t*.3)+Math.cos(y*.3-t*.4)+Math.sin((x+y)*.18-t*.2)+3)/6;return hsv(.62+v*.2,.8,v*.45);
    case 54:v=n>.82?Math.pow(.5+.5*Math.sin(t*3+n*100),12):.015;return scale(c,v);
    case 55:return y<9?hsv(.03+(y/9)*.09,.85,.35+.45*(.5+.5*Math.sin(t*.3))):hsv(.78,.7,.15+.15*Math.sin(x*.8+y-t*2));
    case 56:v=wrap(wrap(14-t*(1+noise(x)*2)+noise(x+8)*15,15)-y,15);return hsv(.01+.05*(y/14),1,v<2?(1-v/2)*(y/14):.015*(y/14));
    case 57:{const yy=y+Math.sin(x*.35-t*2)*1.5;return yy<5?[245,135,30]:yy<10?[220,235,245]:[25,155,75];}
    case 58:{const xx=Math.floor(x+t*3),col=Math.floor(xx/4),row=Math.floor(y/6),digit=noise(col+row*93)>.5,gy=y%6,gx=xx%4;const glyph=digit?[2,6,2,2,7]:[7,5,5,5,7];v=gy<5&&gx<3&&(glyph[gy]&(4>>gx))?1:0;return scale([30,230,95],v);}
    case 59:return effectPixel([0,20,7,30,37,46][Math.floor(t/6)%6],x,y,wrap(t,6),c);
    default:throw new RangeError('Unknown effect ID');
  }
}

export function renderEffect(id,tSeconds,speed=50,color=[25,185,255]) {
  if(!Number.isInteger(id)||id<0||id>=EFFECTS.length)throw new RangeError('Effect ID must be 0..59');
  if(!Number.isFinite(tSeconds)||tSeconds<0)throw new RangeError('Time must be a finite, nonnegative number');
  const rgb=Array.isArray(color)||ArrayBuffer.isView(color)?Array.from(color):[color.red,color.green,color.blue];
  if(rgb.length!==3||rgb.some(n=>!Number.isFinite(n)))throw new TypeError('Color must contain three RGB values');
  const c=rgb.map(n=>Math.max(0,Math.min(255,Math.round(n))));
  const rate=Math.max(1,Math.min(100,Number(speed)||50));
  const t=tSeconds*(.2+rate/25),frame=new Uint8Array(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)frame.set(effectPixel(id,x,y,t,c),(y*W+x)*3);
  return frame;
}
