#include <iostream>
using namespace std;
int main(){ int y,m; cin>>y>>m; bool leap=y%400==0||(y%4==0&&y%100!=0); int d=m==2?(leap?29:28):(m==4||m==6||m==9||m==11?30:31); cout<<d<<'\n'; }
