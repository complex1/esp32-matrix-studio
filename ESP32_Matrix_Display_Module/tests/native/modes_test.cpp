#include "ModeEngine.h"
#include "MatrixEffects.h"
#include "MatrixFont.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static uint32_t fakeNow = 0;
static unsigned displays = 0;
static Matrix::Frame shown{};
uint32_t millis() { return fakeNow; }
void Matrix::Display::showFrame(const Frame &frame) { shown=frame; ++displays; }

static uint32_t energy(const Matrix::Frame &f) {
  const auto *bytes=reinterpret_cast<const uint8_t *>(&f);
  uint32_t sum=0;
  for(size_t i=0;i<sizeof(f);++i)sum+=bytes[i];
  return sum;
}

int main(int argc, char **argv) {
  using namespace Matrix;
  const Color fg{25,185,255},bg{0,0,0};
  if(argc==2&&strcmp(argv[1],"--dump")==0) {
    Frame f{};
    for(uint8_t id=0;id<EFFECT_COUNT;++id) {
      renderEffect(f,id,1.23456f,fg);
      fwrite(&f,1,sizeof(f),stdout);
    }
    return 0;
  }
  Display display;
  ModeEngine modes(display);
  assert(strcmp(modes.modeName(),"manual")==0);
  modes.tick();assert(displays==0);
  assert(!modes.startEffect(60,50,fg));
  assert(!modes.startEffect(0,0,fg));
  assert(!modes.startEffect(0,101,fg));
  assert(modes.startEffect(0,50,fg));
  modes.tick();assert(displays==1&&energy(shown)>0);
  fakeNow+=49;modes.tick();assert(displays==1);
  fakeNow+=1;modes.tick();assert(displays==2);
  modes.stop();fakeNow+=500;modes.tick();assert(displays==2);

  assert(!modes.startClock(0,0,false,false,fg,bg));
  assert(!modes.startClock(1700000000,841,false,false,fg,bg));
  assert(modes.startClock(1700000000,330,false,true,fg,bg));
  modes.tick();assert(energy(shown)>0&&strcmp(modes.modeName(),"clock")==0);
  assert(modes.startClock(1700000000,-840,true,false,fg,bg));
  modes.tick();assert(energy(shown)>0);

  assert(!modes.startTimer(0,fg,bg));
  assert(!modes.startTimer(86401,fg,bg));
  assert(modes.startTimer(1,fg,bg));
  modes.tick();assert(strcmp(modes.modeName(),"timer")==0);
  const Frame beforeTimer=shown;
  fakeNow+=1200;modes.tick();assert(memcmp(&beforeTimer,&shown,sizeof(shown))!=0);
  assert(energy(shown)>0); // The completed timer remains visibly pulsing.

  char text[242];memset(text,'A',241);text[241]=0;
  assert(!modes.startText(text,50,1,fg,bg));
  text[240]=0;assert(modes.startText(text,50,2,fg,bg));
  assert(!modes.startText("line\nline",50,1,fg,bg));
  assert(!modes.startText("",50,1,fg,bg));
  assert(!modes.startText("X",50,3,fg,bg));
  assert(modes.startText("HELLO",50,1,fg,bg));
  modes.tick();assert(energy(shown)==0); // Enters from just beyond the right edge.
  fakeNow+=1000;modes.tick();assert(energy(shown)>0);
  FontConfig font; font.x=-15;font.y=3;font.foreground=fg;
  Frame clipped{};drawTextLine(clipped,"HELLO WORLD",font);
  for(int y=8;y<HEIGHT;++y)for(int x=0;x<WIDTH;++x)
    assert(clipped.pixels[y][x].red==0&&clipped.pixels[y][x].green==0&&clipped.pixels[y][x].blue==0);
  font.x=-32000;font.y=32000;drawTextLine(clipped,text,font);

  assert(!modes.beginFrames(0));assert(!modes.beginFrames(49));
  assert(modes.beginFrames(48));assert(modes.frameCount()==48);
  assert(!modes.startFrames(100,true));
  Frame f{};
  for(uint8_t i=0;i<47;++i) {f.pixels[0][0]={i,0,0};assert(modes.setFrame(i,f));}
  assert(!modes.startFrames(100,true));
  f.pixels[0][0]={47,0,0};assert(modes.setFrame(47,f));
  assert(!modes.setFrame(48,f));assert(!modes.setFrame(255,f));
  assert(!modes.startFrames(49,true));assert(!modes.startFrames(2001,true));
  assert(modes.startFrames(50,true));modes.tick();assert(shown.pixels[0][0].red==0);
  fakeNow+=50;modes.tick();assert(shown.pixels[0][0].red==1);
  fakeNow+=50*47;modes.tick();assert(shown.pixels[0][0].red==0);
  assert(modes.startFrames(50,false));modes.tick();
  fakeNow+=50*49;modes.tick();assert(shown.pixels[0][0].red==47);
  assert(strcmp(modes.modeName(),"manual")==0);

  // Clock elapsed-time and render throttling must work across millis() wrap.
  fakeNow=UINT32_MAX-20;
  assert(modes.startClock(1700000000,0,false,false,fg,bg));modes.tick();
  const Frame beforeWrap=shown;const auto countBeforeWrap=displays;
  fakeNow+=1100;modes.tick();assert(displays==countBeforeWrap+1);
  assert(memcmp(&beforeWrap,&shown,sizeof(shown))!=0);

  const float times[]={0,.17f,.71f,1.33f,2.79f,5.1f};
  for(uint8_t id=0;id<EFFECT_COUNT;++id) {
    Frame first{},current{};renderEffect(first,id,times[0]*2.2f,fg);
    bool moving=false;uint64_t total=energy(first);
    for(size_t i=1;i<sizeof(times)/sizeof(times[0]);++i) {
      renderEffect(current,id,times[i]*2.2f,fg);total+=energy(current);
      moving|=memcmp(&first,&current,sizeof(first))!=0;
    }
    assert(total>0&&moving);
  }
  ModeEngine network(display);
  network.beginNetworkStatus();
  assert(strcmp(network.modeName(),"network")==0);
  network.tick();
  const Frame connecting=shown;
  assert(energy(connecting)>0);
  const unsigned firstNetworkDisplay=displays;
  fakeNow+=99;network.tick();assert(displays==firstNetworkDisplay);
  fakeNow+=701;network.tick();assert(memcmp(&connecting,&shown,sizeof(shown))!=0);
  network.updateNetworkStatus(ModeEngine::NetworkState::Connected,1,42);
  network.tick();
  Frame expected{};
  FontConfig statusFont;
  statusFont.x=2;statusFont.y=5;statusFont.foreground={0,200,255};
  drawTextLine(expected,"1.42",statusFont);
  assert(memcmp(&expected,&shown,sizeof(shown))==0);
  network.updateNetworkStatus(ModeEngine::NetworkState::Connected,255,255);
  network.tick();
  expected={};statusFont.x=2;statusFont.y=1;
  drawTextLine(expected,"255.",statusFont);
  statusFont.x=4;statusFont.y=9;drawTextLine(expected,"255",statusFont);
  assert(memcmp(&expected,&shown,sizeof(shown))==0);

  // Every possible address suffix is drawn within the fixed 20x15 frame.
  // This also catches accidental nonblack backgrounds or stale prior lines.
  for(unsigned third=0;third<=255;++third)for(unsigned fourth=0;fourth<=255;++fourth) {
    network.updateNetworkStatus(ModeEngine::NetworkState::Connected,third,fourth);
    network.tick();
    char suffix[8];snprintf(suffix,sizeof(suffix),"%u.%u",third,fourth);
    const bool split=strlen(suffix)*4-1>WIDTH;
    bool lit=false,black=false;
    for(int y=0;y<HEIGHT;++y)for(int x=0;x<WIDTH;++x) {
      const Color color=shown.pixels[y][x];
      const bool isBlack=color.red==0&&color.green==0&&color.blue==0;
      lit|=!isBlack;black|=isBlack;
      assert(isBlack||(color.red==0&&color.green==200&&color.blue==255));
      if(split?(y<1||(y>5&&y<9)||y>13):(y<5||y>9))assert(isBlack);
    }
    assert(lit&&black);
  }
  network.updateNetworkStatus(ModeEngine::NetworkState::Unavailable);
  network.tick();assert(energy(shown)>0);
  assert(shown.pixels[1][18].red==255&&shown.pixels[1][18].green==55);
  for(int x=0;x<WIDTH;++x) {
    const Color top=shown.pixels[0][x],bottom=shown.pixels[14][x];
    assert(top.red==0&&top.green==0&&top.blue==0);
    assert(bottom.red==0&&bottom.green==0&&bottom.blue==0);
  }
  network.updateNetworkStatus(ModeEngine::NetworkState::Connecting);
  network.tick();assert(strcmp(network.modeName(),"network")==0);

  assert(network.startEffect(20,50,fg));network.tick();
  const Frame rainBeforeUpdate=shown;
  network.updateNetworkStatus(ModeEngine::NetworkState::Connected,9,9);
  assert(strcmp(network.modeName(),"effect")==0);
  network.tick();assert(memcmp(&rainBeforeUpdate,&shown,sizeof(shown))==0);
  network.stop();
  const unsigned stoppedDisplays=displays;
  network.updateNetworkStatus(ModeEngine::NetworkState::Unavailable);
  fakeNow+=1000;network.tick();
  assert(strcmp(network.modeName(),"manual")==0&&displays==stoppedDisplays);

  network.beginNetworkStatus();network.tick();
  assert(network.beginFrames(2));
  Frame red{},green{};red.pixels[0][0]={255,0,0};green.pixels[0][0]={0,255,0};
  assert(network.setFrame(0,red)&&network.setFrame(1,green));
  assert(network.startFrames(500,true));network.tick();
  network.updateNetworkStatus(ModeEngine::NetworkState::Connected,1,42);
  assert(strcmp(network.modeName(),"animation")==0);
  fakeNow+=500;network.tick();assert(memcmp(&shown,&green,sizeof(shown))==0);
  network.updateNetworkStatus(ModeEngine::NetworkState::Unavailable);
  fakeNow+=500;network.tick();assert(memcmp(&shown,&red,sizeof(shown))==0);
  puts("Native mode tests passed: bounds, 48-frame readiness, timer, rollover, all 60 effects, network suffixes and ownership.");
}
