#include <iostream>
using namespace std;
int main(){ long long x; cin>>x; bool a=x%3==0,b=x%10>=5; cout<<(a&&b)<<' '<<(a||b)<<' '<<(a!=b)<<' '<<(!a&&!b)<<'\n'; }
