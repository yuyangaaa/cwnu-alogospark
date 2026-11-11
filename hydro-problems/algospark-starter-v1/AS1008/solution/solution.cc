#include <iostream>
using namespace std;
int main(){ int h1,m1,h2,m2; cin>>h1>>m1>>h2>>m2; int d=h2*60+m2-h1*60-m1; cout<<d/60<<' '<<d%60<<'\n'; }
