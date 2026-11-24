// Source-extraction unit adapter, not the libwps library or Office converter.
// The marked sections are injected byte-for-byte from the hash-pinned source.
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

template<class T> struct Vec2 {
  std::array<T,2> data;
  Vec2(T x=0,T y=0):data{x,y}{}
  T& operator[](size_t i){return data.at(i);}
  T operator[](size_t i)const{return data.at(i);}
};
using Vec2i=Vec2<int>;
using Vec2b=Vec2<bool>;
namespace librevenge {
  using RVNGString=std::string;
  struct RVNGPropertyList;
  constexpr int RVNG_SEEK_SET=0;
}
struct WKSContentListener {
// @INSTRUCTION@
};
std::ostream& operator<<(std::ostream& o,WKSContentListener::FormulaInstruction const& i){return o<<i.m_content;}
struct Input {
  std::vector<uint8_t> data;size_t position=0;
  explicit Input(std::vector<uint8_t> b):data(std::move(b)){}
  long tell()const{return long(position);}
  bool isEnd()const{return position>=data.size();}
  void seek(long p,int){if(p<0||size_t(p)>data.size())throw std::runtime_error("seek");position=size_t(p);}
  uint8_t byte(){if(isEnd())throw std::runtime_error("read");return data[position++];}
};
namespace libwps {
  unsigned readU8(std::shared_ptr<Input> const& p){return p->byte();}
  int read8(std::shared_ptr<Input> const& p){return int8_t(p->byte());}
  unsigned readU16(std::shared_ptr<Input> const& p){unsigned a=p->byte();return a|(unsigned(p->byte())<<8);}
  int read16(std::shared_ptr<Input> const& p){return int16_t(readU16(p));}
  bool readDouble8(std::shared_ptr<Input> const& p,double& value,bool& nan){
    uint8_t b[8];for(auto& x:b)x=p->byte();std::memcpy(&value,b,8);nan=std::isnan(value);return true;
  }
}
#define WPS_DEBUG_MSG(x) do{}while(false)
struct Diagnostics {void addDelimiter(long,char){}};
struct MainParser {
  std::string getFileName(int){throw std::runtime_error("External references outside adapter scope");}
};
class QuattroDosSpreadsheet {
  int m_version;
  std::shared_ptr<Input> m_input;
  MainParser m_mainParser;
  Diagnostics m_diagnostics;
public:
  QuattroDosSpreadsheet(int version,std::vector<uint8_t> bytes):m_version(version),m_input(std::make_shared<Input>(std::move(bytes))){}
  int version()const{return m_version;}
  Diagnostics& ascii(){return m_diagnostics;}
  bool readCell(Vec2i,WKSContentListener::FormulaInstruction&,bool=false,int=0);
  bool readFormula(long,Vec2i const&,int,std::vector<WKSContentListener::FormulaInstruction>&,std::string&);
};
// @CELL@
// @FUNCTIONS@
// @FORMULA@

using Instruction=WKSContentListener::FormulaInstruction;
std::string render(std::vector<Instruction> const& instructions){
  std::ostringstream out;
  auto cell=[&](Instruction const& i,int index){
    if(!i.m_positionRelative[index][0])out<<'$';out<<char('A'+i.m_position[index][0]);
    if(!i.m_positionRelative[index][1])out<<'$';out<<i.m_position[index][1]+1;
  };
  for(auto const& i:instructions){
    if(i.m_type==Instruction::F_Cell)cell(i,0);
    else if(i.m_type==Instruction::F_CellList){cell(i,0);out<<':';cell(i,1);}
    else if(i.m_type==Instruction::F_Long)out<<i.m_longValue;
    else if(i.m_type==Instruction::F_Double)out<<i.m_doubleValue;
    else out<<i.m_content;
  }
  return out.str();
}
std::string parse(std::vector<uint8_t> const& bytes,int version,int column){
  QuattroDosSpreadsheet reader(version,bytes);
  std::vector<Instruction> formula;std::string error;
  if(!reader.readFormula(long(bytes.size()),Vec2i(column,14),0,formula,error))throw std::runtime_error(error);
  return render(formula);
}
unsigned word(std::vector<uint8_t> const& bytes,size_t offset){return bytes.at(offset)|(unsigned(bytes.at(offset+1))<<8);}
void putWord(std::vector<uint8_t>& b,unsigned w){b.push_back(uint8_t(w));b.push_back(uint8_t(w>>8));}
std::vector<uint8_t> program(std::vector<uint8_t> const& tokens,int version){
  std::vector<uint8_t> b;unsigned size=unsigned(tokens.size())+(version==1?4:2);
  putWord(b,size);putWord(b,size);if(version==1)putWord(b,size);b.insert(b.end(),tokens.begin(),tokens.end());return b;
}
int main(int argc,char** argv){
  if(argc!=2)return 2;
  std::ifstream stream(argv[1],std::ios::binary);
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(stream)),{});
  if(bytes.size()!=4784||word(bytes,0)!=0||word(bytes,2)!=2||word(bytes,4)!=0x5121)return 3;
  int failures=0,checks=0,sourcePrograms=0;
  auto check=[&](std::string const& actual,std::string const& expected){
    ++checks;std::cout<<(actual==expected?"PASS ":"FAIL ")<<actual<<" expected "<<expected<<'\n';if(actual!=expected)++failures;
  };
  for(size_t offset=0;offset+4<=bytes.size();){
    unsigned type=word(bytes,offset),size=word(bytes,offset+2);size_t begin=offset+4;
    if(begin+size>bytes.size())throw std::runtime_error("truncated source");
    if(type==0x10){
      ++sourcePrograms;unsigned column=word(bytes,begin),row=word(bytes,begin+2);
      if(size!=47||row!=14||column<1||column>4)return 4;
      std::vector<uint8_t> formula(bytes.begin()+begin+14,bytes.begin()+begin+size);
      check(parse(formula,2,column),"VLookUp($A$15;$A$2:$E$11;"+std::to_string(column+1)+")");
      auto hlookup=formula;if(hlookup.at(9)!=0x55)return 5;hlookup[9]=0x5a;
      check(parse(hlookup,2,column),"HLookup($A$15;$A$2:$E$11;"+std::to_string(column)+")");
    }
    offset=begin+size;
  }
  if(sourcePrograms!=4)return 6;
  // Synthetic operand controls, not synthetic files or format-acceptance claims.
  std::vector<uint8_t> literal={5,7,0,5,8,0,5,1,0,0x55,3};
  check(parse(program(literal,1),1,0),"VLookUp(7;8;1)");
  check(parse(program(literal,2),2,0),"VLookUp(7;8;2)");
  std::vector<uint8_t> expression={5,7,0,5,8,0,5,2,0,5,3,0,5,4,0,11,9,0x55,3};
  check(parse(program(expression,2),2,0),"VLookUp(7;8;(2+3*4)+1)");
  std::cout<<checks<<" checks; "<<failures<<" failures; four genuine source programs\n";
  return failures?1:0;
}
